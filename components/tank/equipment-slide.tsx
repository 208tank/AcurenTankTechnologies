'use client';
import Image from 'next/image';
import { ScanLine } from 'lucide-react';
import type { Equipment } from '@/lib/equipment';
import { asset } from '@/lib/base-path';

/**
 * Full-width slide for one scanner. Sized with container units (see
 * `.equip` in globals.css), so it fits the presentation player and the
 * booth TV alike.
 */
export default function EquipmentSlide({
  item,
  technologyName,
}: {
  item: Equipment;
  technologyName: string;
}) {
  const hasOutputs = item.outputs.length > 0;
  return (
    <div className={`equip ${hasOutputs ? 'equip-with-outputs' : ''}`}>
      <div className="equip-hero">
        {item.photo ? (
          <Image
            src={asset(item.photo)}
            alt={item.photoAlt || `${item.name} scanner`}
            fill
            unoptimized
            priority
            className="object-cover"
          />
        ) : (
          <div className="equip-hero-placeholder" aria-hidden="true">
            <ScanLine />
            <span>{item.name}</span>
          </div>
        )}
        <span className="equip-badge">{technologyName} equipment</span>
      </div>

      <div className="equip-copy">
        <p className="equip-maker">{item.maker}</p>
        <h2 className="equip-name">{item.name}</h2>
        <p className="equip-tagline">{item.tagline}</p>
        <dl className="equip-stats">
          {item.stats.map((s) => (
            <div key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
        <ul className="equip-features">
          {item.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <p className="equip-note">Manufacturer specifications.</p>
      </div>

      {hasOutputs && (
        <div className="equip-outputs">
          <p className="equip-outputs-title">Example outputs</p>
          <div className="equip-outputs-row">
            {item.outputs.map((o) => (
              <figure key={o.image}>
                <div className="equip-output-image">
                  <Image
                    src={asset(o.image)}
                    alt={o.caption}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
                <figcaption>{o.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
