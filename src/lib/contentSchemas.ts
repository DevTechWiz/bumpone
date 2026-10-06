import { z } from 'zod';
import { stripControlChars } from './textSanitize';

/**
 * User-content schemas for the war-room feed and abuse reports (Phase 4).
 * Both strip control/bidi characters BEFORE length validation so stored
 * content can never carry terminal escapes or invisible text.
 */
export const messageSchema = z.object({
  text: z
    .string()
    .transform(stripControlChars)
    .pipe(
      z
        .string()
        .trim()
        .min(1, 'Message cannot be empty')
        .max(200, 'Message cannot exceed 200 characters')
    ),
  slotTag: z.number().int().min(1).max(100).optional(),
});

export const ReportSchema = z
  .object({
    projectId: z.string().optional(),
    profileId: z.string().optional(),
    reason: z.enum(['scam', 'spam', 'offensive', 'broken_link', 'other']),
    details: z
      .string()
      .transform(stripControlChars)
      .pipe(
        z
          .string()
          .trim()
          .min(10, 'A comment with at least 10 characters is required for review')
          .max(500)
      ),
  })
  .refine((data) => Boolean(data.projectId || data.profileId), {
    message: 'Either projectId or profileId is required',
  });
