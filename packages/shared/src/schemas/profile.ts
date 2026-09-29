import { z } from 'zod';
import { SHARE_VISIBILITIES } from '../types.js';

/**
 * Public-page handle: 3-32 chars, lowercase letters / digits / dashes,
 * starting and ending alphanumeric (SPEC-019).
 */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

/** Most rel="me" links one profile may have (SPEC-026). */
export const MAX_ME_LINKS = 8;

/**
 * A web address for a public page (SPEC-026): http or https with a real
 * domain, trimmed, stored as typed. Not z.url(): that also takes
 * javascript: and mailto:.
 */
export const webUrlSchema = z.string().trim().pipe(z.httpUrl().max(300));

/** An image shown on a public page: https only, so the page has no mixed content. */
export const httpsImageUrlSchema = z
  .string()
  .trim()
  .pipe(z.url({ protocol: /^https$/, hostname: z.regexes.domain }).max(300));

/** rel="me" links: up to MAX_ME_LINKS, exact duplicates dropped, order kept. */
export const meLinksSchema = z
  .array(webUrlSchema)
  .max(MAX_ME_LINKS)
  .transform((links) => [...new Set(links)]);

/** PUT /profile body. All fields optional; the first PUT may omit the slug
 *  (the server derives a suggestion from the username). */
export const updateProfileSchema = z.object({
  slug: z.string().regex(SLUG_RE, 'Lowercase letters, numbers, and dashes').optional(),
  title: z.string().min(1).max(80).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  visibility: z.enum(SHARE_VISIBILITIES).optional(),
  /** Publish the blogroll page + OPML at /u/<slug>/blogroll (SPEC-020). */
  blogrollEnabled: z.boolean().optional(),
  /** The user's own site: the h-card URL and a rel="me" link (SPEC-026). */
  websiteUrl: webUrlSchema.nullable().optional(),
  /** An https image for the h-card (SPEC-026). */
  photoUrl: httpsImageUrlSchema.nullable().optional(),
  /** Other profiles of the same person, as rel="me" links (SPEC-026). */
  meLinks: meLinksSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** GET/PUT /profile response. */
export const profileSchema = z.object({
  slug: z.string(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  visibility: z.enum(SHARE_VISIBILITIES),
  /** Absolute URL of the public page; null unless visibility is 'public'. */
  shareUrl: z.string().nullable(),
  blogrollEnabled: z.boolean(),
  /** Absolute URL of the blogroll page; null unless blogrollEnabled. */
  blogrollUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  photoUrl: z.string().nullable(),
  meLinks: z.array(z.string()),
});
export type ProfileDto = z.infer<typeof profileSchema>;

/** Query for GET /shares/community. */
export const communityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type CommunityQuery = z.infer<typeof communityQuerySchema>;

/** One item in the instance-local Community view (SPEC-019). */
export interface CommunityShare {
  sharedAt: string;
  note: string | null;
  user: { displayName: string; slug: string };
  article: {
    id: string;
    title: string | null;
    url: string | null;
    summary: string | null;
    publishedAt: string | null;
  };
  feed: { id: string; title: string | null; feedUrl: string; faviconUrl: string | null };
  /** Whether the caller is already subscribed to the source feed. */
  subscribed: boolean;
}
