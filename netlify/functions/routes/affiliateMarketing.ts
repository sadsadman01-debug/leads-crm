import type { HandlerEvent } from '@netlify/functions'
import { getSupabaseAdmin } from '../lib/supabaseAdmin.js'
import { HttpError, json } from '../lib/http.js'
import { getAffiliateForUser } from './affiliates.js'
import { getOrCreateAffiliateSettingsRow, renderTemplate } from '../lib/affiliateSettings.js'
import { getOrCreateBillingSettingsRow, computeCurrentPricingTier } from '../lib/billingSettings.js'
import { requireSuperAdmin, requireAal2IfEnrolled } from '../lib/permissions.js'
import type { AuthedUser } from '../lib/auth.js'

/** Query: ?referral_link=... — the frontend constructs the actual URL (it
 * already knows its own origin), the backend just substitutes merge fields
 * into whatever templates the Super Admin configured. */
export async function getMyMarketingMaterials(event: HandlerEvent, user: AuthedUser) {
  const affiliate = await getAffiliateForUser(user)
  const supabase = getSupabaseAdmin()
  const referralLink = event.queryStringParameters?.referral_link || ''

  const [settings, billingSettings, { data: platformRow }] = await Promise.all([
    getOrCreateAffiliateSettingsRow(),
    getOrCreateBillingSettingsRow(),
    supabase.from('platform_settings').select('platform_name').limit(1).maybeSingle(),
  ])
  const pricing = await computeCurrentPricingTier(billingSettings)
  const platformName = platformRow?.platform_name || 'Leadify'

  const fields = {
    affiliate_name: affiliate.full_name,
    referral_link: referralLink,
    price: `$${pricing.monthly_price_usd}/month`,
    platform_name: platformName,
  }

  const headline = settings.affiliate_promo_headline || 'Join thousands growing their sales pipeline'
  const subheadline = settings.affiliate_promo_subheadline || 'Start your free trial today'
  const imagePrompt = [
    `Create a professional, high-converting, click-bait-style promotional image (1200x630, landscape, social-media-ready) advertising "${platformName}", a lead management CRM.`,
    `Headline text to feature prominently: "${headline}"`,
    `Subheadline text: "${subheadline}"`,
    `Include this referral link as clearly readable text somewhere in the image: ${referralLink || '{{your referral link}}'}`,
    `Style: modern SaaS marketing graphic, dark background with a vibrant accent color, bold clean sans-serif typography, subtle abstract shapes or a dashboard/graph motif suggesting sales growth, high contrast, premium and trustworthy feel — the kind of image that gets clicks on Facebook or LinkedIn ads.`,
    `Do not include any fake logos, fake testimonials, or misleading claims — keep the tone confident and benefit-driven (e.g. pipeline growth, more closed deals, ${pricing.monthly_price_usd ? `pricing starting at $${pricing.monthly_price_usd}/month` : 'affordable pricing'}) without being deceptive.`,
  ].join('\n')

  return json(200, {
    facebook_post: renderTemplate(settings.affiliate_fb_post_template, fields),
    email_subject: renderTemplate(settings.affiliate_email_subject_template, fields),
    email_body: renderTemplate(settings.affiliate_email_body_template, fields),
    image_prompt: imagePrompt,
    program_terms: settings.affiliate_program_terms,
  })
}

export async function getAffiliateSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  const settings = await getOrCreateAffiliateSettingsRow()
  return json(200, settings)
}

export async function updateAffiliateSettings(event: HandlerEvent, user: AuthedUser) {
  requireSuperAdmin(user)
  await requireAal2IfEnrolled(user)
  const supabase = getSupabaseAdmin()
  const body = JSON.parse(event.body || '{}')
  const row = await getOrCreateAffiliateSettingsRow()
  const update: Record<string, any> = {}

  if ('affiliate_program_enabled' in body) update.affiliate_program_enabled = Boolean(body.affiliate_program_enabled)
  if ('affiliate_first_payment_commission_pct' in body) {
    const n = Number(body.affiliate_first_payment_commission_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'First-Payment Commission % must be between 0 and 100')
    update.affiliate_first_payment_commission_pct = n
  }
  if ('affiliate_recurring_commission_pct' in body) {
    const n = Number(body.affiliate_recurring_commission_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Recurring Commission % must be between 0 and 100')
    update.affiliate_recurring_commission_pct = n
  }
  if ('affiliate_recurring_duration_type' in body) {
    if (!['lifetime', 'capped'].includes(body.affiliate_recurring_duration_type)) throw new HttpError(400, 'Invalid recurring duration type')
    update.affiliate_recurring_duration_type = body.affiliate_recurring_duration_type
  }
  if ('affiliate_recurring_duration_count' in body) {
    update.affiliate_recurring_duration_count = body.affiliate_recurring_duration_count != null ? Number(body.affiliate_recurring_duration_count) : null
  }
  if ('affiliate_min_withdrawal_usd' in body) {
    update.affiliate_min_withdrawal_usd = body.affiliate_min_withdrawal_usd != null ? Number(body.affiliate_min_withdrawal_usd) : null
  }
  if ('affiliate_program_terms' in body) update.affiliate_program_terms = (body.affiliate_program_terms ?? '').trim() || null
  if ('affiliate_fb_post_template' in body) update.affiliate_fb_post_template = (body.affiliate_fb_post_template ?? '').trim() || null
  if ('affiliate_email_subject_template' in body) update.affiliate_email_subject_template = (body.affiliate_email_subject_template ?? '').trim() || null
  if ('affiliate_email_body_template' in body) update.affiliate_email_body_template = (body.affiliate_email_body_template ?? '').trim() || null
  if ('affiliate_promo_headline' in body) update.affiliate_promo_headline = (body.affiliate_promo_headline ?? '').trim() || null
  if ('affiliate_promo_subheadline' in body) update.affiliate_promo_subheadline = (body.affiliate_promo_subheadline ?? '').trim() || null

  if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update')

  const { data, error } = await supabase.from('platform_settings').update(update).eq('id', row.id).select('*').single()
  if (error) throw new HttpError(500, error.message)
  return json(200, data)
}

/** Public — the "Become an Affiliate" application form needs the current
 * Program Terms and whether the program is even open before submitting. */
export async function getPublicAffiliateProgramInfo() {
  const settings = await getOrCreateAffiliateSettingsRow()
  return json(200, {
    enabled: settings.affiliate_program_enabled,
    terms: settings.affiliate_program_terms,
    first_payment_commission_pct: settings.affiliate_first_payment_commission_pct,
    recurring_commission_pct: settings.affiliate_recurring_commission_pct,
  })
}
