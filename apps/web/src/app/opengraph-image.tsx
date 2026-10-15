import { ImageResponse } from 'next/og';

export const alt = 'randomCall — Free random video chat with strangers';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Share preview for links to the site (also used for X / Twitter). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 80,
          background: 'radial-gradient(ellipse 70% 80% at 80% 40%, #3a1440 0%, #0b0811 65%)',
          color: '#f4f5f7',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 44, fontWeight: 700 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#ff6fae,#a36bff)', display: 'flex' }} />
          randomCall
        </div>
        <div style={{ marginTop: 48, fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -2, display: 'flex', flexDirection: 'column' }}>
          <span>Meet someone new</span>
          <span style={{ color: '#ff6fae' }}>in 3 seconds.</span>
        </div>
        <div style={{ marginTop: 32, fontSize: 32, color: '#a9aeb8' }}>Free random video chat · No download · No sign-up</div>
      </div>
    ),
    size,
  );
}
