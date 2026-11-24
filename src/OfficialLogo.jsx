import { useState } from 'react';

/** Main NIMIS national emblem, served from the app's bundled public assets. */
export default function OfficialLogo() {
  const [missing, setMissing] = useState(false);
  const url = `${import.meta.env.BASE_URL}nimis-coat-of-arms.png`;

  return missing
    ? <span className="official-logo-fallback" role="img" aria-label="NIMIS branding">NIMIS</span>
    : <img
        className="official-logo-image"
        src={url}
        alt="Zimbabwe national coat of arms"
        width="42"
        height="42"
        loading="eager"
        decoding="async"
        onError={() => setMissing(true)}
      />;
}
