import type { VercelRequest, VercelResponse } from '@vercel/node'
import { ImageResponse } from '@vercel/og'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

/** Runs as a standard Node.js Vercel Function (not Edge) — @vercel/og's
 * ImageResponse supports both runtimes, and Node avoids any Edge-runtime
 * compatibility risk for the `qrcode` package, which is Node-oriented.
 * Public — validates the referral_code belongs to an ACTIVE affiliate
 * before rendering anything; a stale/invalid code just 404s. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = String(req.query.code ?? '')
  if (!code) {
    res.status(400).send('Missing referral code')
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    res.status(500).send('Server misconfigured')
    return
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, referral_code')
    .eq('referral_code', code)
    .eq('status', 'active')
    .maybeSingle()

  if (!affiliate) {
    res.status(404).send('Affiliate not found')
    return
  }

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('affiliate_promo_headline, affiliate_promo_subheadline, platform_accent_color, platform_name')
    .limit(1)
    .maybeSingle()

  const headline = settings?.affiliate_promo_headline || 'Join thousands growing their sales pipeline'
  const subheadline = settings?.affiliate_promo_subheadline || 'Start your free trial today'
  const accentColor = settings?.platform_accent_color || '#6366f1'
  const platformName = settings?.platform_name || 'Leads CRM'

  const proto = (req.headers['x-forwarded-proto'] as string) || 'https'
  const host = req.headers.host
  const referralLink = `${proto}://${host}/request-access?ref=${affiliate.referral_code}`

  const qrDataUrl = await QRCode.toDataURL(referralLink, {
    width: 220,
    margin: 1,
    color: { dark: '#0a0a0d', light: '#ffffff' },
  })

  const imageResponse = new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: '#0a0a0d',
          color: '#f5f5f7',
          fontFamily: 'sans-serif',
          padding: '64px',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', backgroundColor: accentColor }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: accentColor, display: 'flex' }} />
            <span style={{ fontSize: '28px', fontWeight: 600, display: 'flex' }}>{platformName}</span>
          </div>
          <div style={{ fontSize: '54px', fontWeight: 700, lineHeight: 1.15, maxWidth: '620px', display: 'flex' }}>{headline}</div>
          <div style={{ fontSize: '26px', color: '#a1a1aa', maxWidth: '600px', display: 'flex' }}>{subheadline}</div>
          <div style={{ marginTop: '16px', fontSize: '20px', color: accentColor, fontFamily: 'monospace', display: 'flex' }}>{referralLink}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '16px', display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} width={220} height={220} />
          </div>
          <span style={{ fontSize: '16px', color: '#a1a1aa', display: 'flex' }}>Scan to get started</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )

  const buffer = Buffer.from(await imageResponse.arrayBuffer())
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate')
  res.status(200).send(buffer)
}
