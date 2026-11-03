'use client';
/* eslint-disable @next/next/no-img-element -- images can be browser-stored blobs */
import { ScanLine } from 'lucide-react';
import { Equipment, visibleStats } from '@/lib/equipment';
import { useImageUrl } from '@/lib/image-store';

function SlideImage({
  src,
  alt,
  fit,
}: {
  src: string;
  alt: string;
  fit: 'cover' | 'contain';
}) {
  const url = useImageUrl(src);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      className={`absolute inset-0 h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
    />
  );
}

/**
 * Full-width slide for one piece of equipment. Sized with container units
 * (see `.equip` in globals.css), so it fits the presentation player, the
 * booth TV and the editor preview alike.
 */
export default function EquipmentSlide({
  item,
  badge,
}: {
  item: Equipment;
  /** Small label on the photo, e.g. "MFL equipment". */
  badge?: string;
}) {
  const outputs = item.outputs.filter((o) => o.image);
  const stats = visibleStats(item);
  const features = item.features.filter((f) => f.trim());
  return (
    <div className={`equip ${outputs.length ? 'equip-with-outputs' : ''}`}>
      <div className="equip-hero">
        {item.photo ? (
          <SlideImage src={item.photo} alt={`${item.name} scanner`} fit="cover" />
        ) : (
          <div className="equip-hero-placeholder" aria-hidden="true">
            <ScanLine />
            <span>{item.name || 'Equipment name'}</span>
          </div>
        )}
        {badge && <span className="equip-badge">{badge}</span>}
      </div>

      <div className="equip-copy">
        {item.maker && <p className="equip-maker">{item.maker}</p>}
        <h2 className="equip-name">{item.name || 'Equipment name'}</h2>
        {item.tagline && <p className="equip-tagline">{item.tagline}</p>}
        {stats.length > 0 && (
          <dl className="equip-stats">
            {stats.map((s, i) => (
              <div key={i}>
                <dt>{s.label}</dt>
                <dd>{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {features.length > 0 && (
          <ul className="equip-features">
            {features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
        {stats.length > 0 && <p className="equip-note">Manufacturer specifications.</p>}
      </div>

      {outputs.length > 0 && (
        <div className="equip-outputs">
          <p className="equip-outputs-title">Example outputs</p>
          <div className="equip-outputs-row">
            {outputs.map((o, i) => (
              <figure key={i}>
                <div className="equip-output-image">
                  <SlideImage src={o.image} alt={o.caption || `${item.name} output`} fit="contain" />
                </div>
                {o.caption && <figcaption>{o.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
