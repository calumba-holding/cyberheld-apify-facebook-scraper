export type ProfileLink = {
  text: string;
  href: string;
};

export type ProfileSection = {
  title: string;
  lines: string[];
  links: ProfileLink[];
};

export type PhotoItem = {
  href: string;
  imageUrl: string | null;
  alt: string | null;
};

export type PhotoSection = {
  name: string;
  url: string;
  scrollRounds: number;
  photos: PhotoItem[];
  error?: string;
};

export type PostImage = {
  href: string | null;
  imageUrl: string | null;
  alt: string | null;
};

export type PostLinkPreview = {
  url: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
};

export type PostEngagement = {
  likes?: string;
  comments?: string;
  shares?: string;
};

export type ProfilePost = {
  index: number;
  authorName: string | null;
  authorUrl: string | null;
  text: string | null;
  timestamp: string | null;
  location: string | null;
  permalink: string | null;
  images: PostImage[];
  linkPreview?: PostLinkPreview;
  engagement?: PostEngagement;
  rawText?: string;
};

export type TabExtract = {
  name: string;
  url: string;
  title: string;
  metaDescription?: string;
  headings: string[];
  links: ProfileLink[];
  sections: ProfileSection[];
  listItems: string[];
  visibleText: string;
  photos?: PhotoItem[];
  photoSections?: PhotoSection[];
  posts?: ProfilePost[];
  postScrollRounds?: number;
  postsTarget?: number;
  error?: string;
};

export type ProfileHeader = {
  displayName?: string;
  username?: string;
  profileUrl: string;
  profilePictureUrl?: string;
  coverPhotoUrl?: string;
  intro?: string;
  counts: {
    followers?: string;
    following?: string;
    friends?: string;
  };
  metaTitle?: string;
  metaDescription?: string;
};

export type ProfileScrapeResult = {
  inputUrl: string;
  profileUrl: string;
  scrapedAt: string;
  outputJsonPath?: string;
  sessionVideoPath?: string;
  header: ProfileHeader;
  overview: {
    url: string;
    displayName?: string;
    sections: ProfileSection[];
    links: ProfileLink[];
    postsPreview: string[];
  };
  tabs: Record<string, TabExtract>;
  moreSections: Record<string, TabExtract>;
  errors: string[];
};
