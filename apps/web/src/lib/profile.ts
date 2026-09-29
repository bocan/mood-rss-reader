import {
  httpsImageUrlSchema,
  MAX_ME_LINKS,
  webUrlSchema,
  type ProfileDto,
  type UpdateProfileInput,
} from '@rss/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** The identity fields as the Settings form holds them (SPEC-026). */
export interface IdentityForm {
  website: string;
  photo: string;
  /** One profile address per line. */
  links: string;
}

type IdentityInput = Pick<UpdateProfileInput, 'websiteUrl' | 'photoUrl' | 'meLinks'>;

/**
 * Check the identity fields with the same schemas as the server, so the
 * form can name the bad field or line before it sends anything. Empty
 * fields clear: null for a URL, [] for the links. Line numbers count every
 * line of the box, blank ones too, so they match what the user sees.
 */
export function identityInput(form: IdentityForm): { input: IdentityInput } | { error: string } {
  const website = form.website.trim();
  if (website && !webUrlSchema.safeParse(website).success) {
    return { error: 'Your website is not a web address.' };
  }
  const photo = form.photo.trim();
  if (photo && !httpsImageUrlSchema.safeParse(photo).success) {
    return { error: 'The photo must be an https web address.' };
  }
  const links: string[] = [];
  const lines = form.links.split(/\r?\n/);
  for (const [i, line] of lines.entries()) {
    const link = line.trim();
    if (!link) continue;
    if (!webUrlSchema.safeParse(link).success) return { error: `Line ${i + 1} is not a web address.` };
    if (!links.includes(link)) links.push(link);
  }
  if (links.length > MAX_ME_LINKS) return { error: `Up to ${MAX_ME_LINKS} other profiles.` };
  return { input: { websiteUrl: website || null, photoUrl: photo || null, meLinks: links } };
}

/** The caller's sharing profile (SPEC-019); a server-side suggestion until
 *  they first save one. */
export function useProfile() {
  return useQuery({ queryKey: ['profile'], queryFn: () => api<ProfileDto>('/profile') });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    // Settings shows profile and sharing errors next to their forms.
    meta: { inlineError: true },
    mutationFn: (input: UpdateProfileInput) =>
      api<ProfileDto>('/profile', { method: 'PUT', body: input }),
    onSuccess: (profile) => qc.setQueryData(['profile'], profile),
  });
}
