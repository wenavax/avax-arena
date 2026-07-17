'use client';
import { useEffect } from 'react';

/* ?embed=1 ile yüklenen sayfa site kromu (sidebar, mobil üst bar) olmadan
 * tam viewport render edilir — World Hub overlay iframe'leri için.
 * Sınıf body'de kalır; iframe içi SPA gezinmeleri de embed kalır. */
export function EmbedMode() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      document.body.classList.add('embed');
    }
  }, []);
  return null;
}
