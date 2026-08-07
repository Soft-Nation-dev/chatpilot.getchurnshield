import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { GraphApiService } from 'src/social/services/graph-api.service'
import { SocialAccountService } from 'src/social/services/social-account.service'
import { SOCIAL_PLATFORM } from 'src/social/constants/social.constants'

const PUBLISH_ENABLED =
  (process.env.CONTENT_PUBLISH_ENABLED || 'true') !== 'false'

@Injectable()
export class ContentPublisherService {
  private readonly logger = new Logger(ContentPublisherService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: GraphApiService,
    private readonly socialAccountService: SocialAccountService,
  ) {}

  async publish(postId: number): Promise<string> {
    const post = await this.prisma.content_posts.findUnique({
      where: { id: postId },
    })

    if (!post) return 'not_found'
    if (post.status === 'published') return 'already_published'

    if (!PUBLISH_ENABLED) {
      await this.fail(postId, 'publishing disabled by configuration')
      return 'disabled'
    }

    const accounts = await this.prisma.social_accounts.findMany({
      where: { company_id: post.company_id, is_active: true },
    })

    if (!accounts.length) {
      await this.fail(postId, 'no connected social account')
      return 'no_account'
    }

    const platforms = (post.platforms || 'facebook,instagram')
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)

    const message = [post.caption, post.hashtags].filter(Boolean).join('\n\n')
    const imageUrl = this.firstImage(post.image_urls)

    const errors: string[] = []
    let fbPostId: string | null = null
    let igPostId: string | null = null

    if (platforms.includes(SOCIAL_PLATFORM.FACEBOOK)) {
      const account = accounts.find(
        a => a.platform === SOCIAL_PLATFORM.FACEBOOK,
      )
      if (account) {
        const result = await this.graph.publishPagePost(
          account.page_id || account.external_id,
          message,
          imageUrl,
          this.socialAccountService.token(account),
        )
        if (result.success) {
          fbPostId = result.data?.post_id ?? result.data?.id ?? null
        } else {
          errors.push(`facebook: ${result.error}`)
          if (result.isAuthError) {
            await this.socialAccountService.deactivate(
              account.id,
              result.error ?? 'oauth error',
            )
          }
        }
      }
    }

    if (platforms.includes(SOCIAL_PLATFORM.INSTAGRAM)) {
      const account = accounts.find(
        a => a.platform === SOCIAL_PLATFORM.INSTAGRAM,
      )
      if (account) {
        if (!imageUrl) {
          errors.push('instagram: an image is required')
        } else {
          const result = await this.graph.publishInstagramPost(
            account.ig_user_id || account.external_id,
            message,
            imageUrl,
            this.socialAccountService.token(account),
          )
          if (result.success) {
            igPostId = result.data?.id ?? null
          } else {
            errors.push(`instagram: ${result.error}`)
            if (result.isAuthError) {
              await this.socialAccountService.deactivate(
                account.id,
                result.error ?? 'oauth error',
              )
            }
          }
        }
      }
    }

    if (!fbPostId && !igPostId) {
      await this.fail(postId, errors.join(' | ') || 'no platform published')
      return 'failed'
    }

    await this.prisma.content_posts.update({
      where: { id: postId },
      data: {
        status: 'published',
        published_at: new Date(),
        fb_post_id: fbPostId,
        ig_post_id: igPostId,
        error: errors.length ? errors.join(' | ') : null,
      },
    })

    this.logger.log(
      `Published content post ${postId} (fb=${fbPostId ?? '-'} ig=${igPostId ?? '-'})`,
    )

    return 'published'
  }

  async publishDue(): Promise<number> {
    const due = await this.prisma.content_posts.findMany({
      where: {
        status: { in: ['approved', 'scheduled'] },
        scheduled_at: { not: null, lte: new Date() },
      },
      select: { id: true },
      take: 25,
    })

    let published = 0
    for (const post of due) {
      try {
        const result = await this.publish(post.id)
        if (result === 'published') published++
      } catch (error) {
        this.logger.error(
          `Failed to publish content post ${post.id}`,
          error?.message,
        )
      }
    }

    return published
  }

  private firstImage(imageUrls: string | null): string | null {
    if (!imageUrls) return null
    const first = imageUrls
      .split(',')
      .map(u => u.trim())
      .filter(Boolean)[0]
    return first ?? null
  }

  private async fail(postId: number, reason: string) {
    await this.prisma.content_posts.update({
      where: { id: postId },
      data: { status: 'failed', error: reason.slice(0, 1000) },
    })
  }
}
