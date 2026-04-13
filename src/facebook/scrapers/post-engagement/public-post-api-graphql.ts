import type { Page, Response } from 'playwright';

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };

export interface GraphqlRequestTemplate {
    params: Record<string, string>;
    requestCount: number;
}

export interface GraphqlCapture {
    body: string;
    docId?: string | null;
    friendlyName?: string | null;
}

const nextRequestId = (template: GraphqlRequestTemplate): string => {
    template.requestCount += 1;
    return `z${template.requestCount.toString(36)}`;
};

export const captureTemplateFromResponse = async (
    response: Response,
    expectedFriendlyName: string,
): Promise<{ body: string; template: GraphqlRequestTemplate } | null> => {
    const request = response.request();
    const params = new URLSearchParams(request.postData() || '');
    if (params.get('fb_api_req_friendly_name') !== expectedFriendlyName) return null;

    const body = await response.text().catch(() => '');
    if (!body) return null;

    return {
        body,
        template: {
            params: Object.fromEntries(params.entries()),
            requestCount: 0,
        },
    };
};

export const waitForGraphqlRequestTemplate = async (
    page: Page,
    friendlyName: string,
    timeoutMs = 12000,
): Promise<GraphqlRequestTemplate | null> => {
    return new Promise((resolve) => {
        const handler = (request: import('playwright').Request): void => {
            if (!request.url().includes('/api/graphql/')) return;
            const params = new URLSearchParams(request.postData() || '');
            if (params.get('fb_api_req_friendly_name') !== friendlyName) return;

            clearTimeout(timer);
            page.off('request', handler);
            resolve({
                params: Object.fromEntries(params.entries()),
                requestCount: 0,
            });
        };

        const timer = setTimeout(() => {
            page.off('request', handler);
            resolve(null);
        }, timeoutMs);

        page.on('request', handler);
    });
};

export const waitForGraphqlBootstrap = async (
    page: Page,
    friendlyName: string,
    timeoutMs = 12000,
): Promise<{ body: string; template: GraphqlRequestTemplate } | null> => {
    const response = await page.waitForResponse((candidate) => {
        const request = candidate.request();
        if (!request.url().includes('/api/graphql/')) return false;
        const params = new URLSearchParams(request.postData() || '');
        return params.get('fb_api_req_friendly_name') === friendlyName;
    }, { timeout: timeoutMs }).catch(() => null);

    return response ? captureTemplateFromResponse(response, friendlyName) : null;
};

export const runGraphqlRequest = async (
    page: Page,
    template: GraphqlRequestTemplate,
    friendlyName: string,
    docId: string,
    variables: JsonObject,
    routeName?: string,
): Promise<string | null> => {
    const params = new URLSearchParams(template.params);
    params.set('fb_api_req_friendly_name', friendlyName);
    params.set('doc_id', docId);
    params.set('variables', JSON.stringify(variables));
    params.set('__req', nextRequestId(template));
    if (routeName) params.set('__crn', routeName);

    const result = await page.evaluate(async (body) => {
        const response = await fetch('/api/graphql/', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body,
        });
        return {
            ok: response.ok,
            text: await response.text(),
        };
    }, params.toString()).catch(() => null);

    return result?.ok ? result.text : null;
};

export const combineCaptures = (...captures: Array<GraphqlCapture | undefined>): GraphqlCapture | undefined => {
    const available = captures.filter((capture): capture is GraphqlCapture => Boolean(capture?.body.trim()));
    if (available.length === 0) return undefined;
    if (available.length === 1) return available[0];

    return {
        body: available.map((capture) => capture.body.trim()).join('\n'),
        docId: available.map((capture) => capture.docId).find((value) => value != null) ?? null,
        friendlyName: 'CombinedPublicPostApiPayload',
    };
};
