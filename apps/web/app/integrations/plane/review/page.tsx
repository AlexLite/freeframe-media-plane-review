import { PlaneReviewEmbed } from '@/components/plane-review/plane-review-embed'
import { parseAllowedOrigins } from '@/lib/plane-review-embed'

export const dynamic = 'force-dynamic'

export default function PlaneReviewEmbedPage() {
  const allowedOrigins = parseAllowedOrigins(process.env.PLANE_EMBED_ALLOWED_ORIGINS)

  return <PlaneReviewEmbed allowedOrigins={allowedOrigins} />
}
