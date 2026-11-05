'use client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  R_MAX_FT,
  TANK_D_FT,
  allowFor,
  edgeAllow,
  edgeStations,
  statusColor,
  statusNote,
  type Station,
} from './edge-settlement';

const f2 = (v: number) => v.toFixed(2);
const ft = (inches: number) => (inches / 12).toFixed(1);

/** Radial cross-section at the station: shell, measured bottom, projected plane, R and B. */
function Profile({ st }: { st: Station }) {
  const W = 360,
    H = 190,
    ml = 40,
    mr = 12,
    mt = 14,
    mb = 30;
  const xs = st.pts.map((p) => p.x);
  const xMax = Math.max(...xs);
  const plane = (x: number) => st.line.q + st.line.m * x;
  const zs = [...st.pts.map((p) => p.z), plane(0), plane(xMax)];
  const zLo = Math.floor(Math.min(...zs) - 0.6),
    zHi = Math.ceil(Math.max(...zs) + 0.8);
  const X = (x: number) => ml + (x / xMax) * (W - ml - mr);
  const Z = (z: number) => mt + ((zHi - z) / (zHi - zLo)) * (H - mt - mb);
  const color = statusColor[st.status];
  const settled = st.R !== null;
  const inside = settled ? st.pts.filter((p) => p.x <= st.R! + 1e-6) : [];
  const area = settled
    ? `M${X(0)} ${Z(plane(0))} L${X(st.R!)} ${Z(plane(st.R!))} ${inside
        .slice()
        .sort((a, b) => b.x - a.x)
        .map((p) => `L${X(p.x)} ${Z(p.z)}`)
        .join(' ')} Z`
    : '';
  const zTicks: number[] = [];
  for (let z = zLo; z <= zHi; z++) zTicks.push(z);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Radial profile at station ${st.no}`}>
      <g className="edge-grid">
        {zTicks.map((z) => (
          <line key={z} x1={ml} x2={W - mr} y1={Z(z)} y2={Z(z)} />
        ))}
        {[0, 24, 48, 72, 96, 120].map((x) => (
          <line key={x} x1={X(x)} x2={X(x)} y1={mt} y2={H - mb} />
        ))}
      </g>
      <g className="edge-axis" fontSize="9">
        {zTicks.map((z) => (
          <text key={z} x={ml - 6} y={Z(z) + 3} textAnchor="end">
            {z}
          </text>
        ))}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <text key={v} x={X(v * 12)} y={H - mb + 13} textAnchor="middle">
            {v}
          </text>
        ))}
        <text x={(ml + W - mr) / 2} y={H - 4} textAnchor="middle">
          Distance from shell (ft)
        </text>
        <text x={10} y={(mt + H - mb) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(mt + H - mb) / 2})`}>
          Bottom elevation (in)
        </text>
      </g>
      {settled && <path d={area} fill={color} fillOpacity={0.18} />}
      <line
        className="edge-plane"
        x1={X(0)}
        y1={Z(plane(0))}
        x2={X(xMax)}
        y2={Z(plane(xMax))}
      />
      <polyline className="edge-meas" points={st.pts.map((p) => `${X(p.x)},${Z(p.z)}`).join(' ')} />
      {st.pts.map((p) => (
        <circle key={p.x} cx={X(p.x)} cy={Z(p.z)} r={2.6} className="edge-pt" />
      ))}
      <line className="edge-shell" x1={X(0)} x2={X(0)} y1={mt} y2={Z(st.pts[0].z)} />
      <text className="edge-axis" x={X(0) + 5} y={mt + 9} fontSize="9">
        Shell
      </text>
      {settled && (
        <>
          <line x1={X(st.R!)} x2={X(st.R!)} y1={mt} y2={H - mb} stroke={color} strokeDasharray="3 3" />
          <text x={X(st.R!) + 4} y={mt + 9} fontSize="9" fill={color} fontWeight={700}>
            R {ft(st.R!)} ft
          </text>
          <line x1={X(st.xB) + 7} x2={X(st.xB) + 7} y1={Z(plane(st.xB))} y2={Z(plane(st.xB) - st.B)} stroke={color} strokeWidth={1.6} markerEnd="url(#edge-arrow)" markerStart="url(#edge-arrow)" />
          <text x={X(st.xB) + 12} y={(Z(plane(st.xB)) + Z(plane(st.xB) - st.B)) / 2 + 3} fontSize="10" fill={color} fontWeight={700}>
            B {f2(st.B)} in
          </text>
        </>
      )}
      <defs>
        <marker id="edge-arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L6 3 L0 6 Z" fill={color} />
        </marker>
      </defs>
    </svg>
  );
}

/** Annex B chart: Fig. B.11 (Bew) and Fig. B.12 (Be) for this tank, with the station plotted. */
function AnnexB({ st }: { st: Station }) {
  const W = 360,
    H = 200,
    ml = 40,
    mr = 12,
    mt = 12,
    mb = 30,
    bMax = 7;
  const X = (r: number) => ml + (r / R_MAX_FT) * (W - ml - mr);
  const Y = (b: number) => mt + ((bMax - b) / bMax) * (H - mt - mb);
  const rs: number[] = [];
  for (let r = 0; r <= R_MAX_FT + 1e-9; r += 0.05) rs.push(r);
  const pts = rs.map((r) => ({ r, ...edgeAllow(TANK_D_FT, r) }));
  const path = (fn: (p: (typeof pts)[number]) => number | null) =>
    pts
      .map((p) => fn(p))
      .map((v, i) => (v === null ? '' : `${i ? 'L' : 'M'}${X(rs[i]).toFixed(1)} ${Y(v).toFixed(1)}`))
      .join(' ');
  const governing = (p: (typeof pts)[number]) =>
    p.Bew === null || p.Be === null ? null : allowFor(p.Bew, p.Be, st.weld).allow;
  const angled = st.weld.kind === 'angle' && st.weld.alpha > 20 && st.weld.alpha < 70;
  const color = statusColor[st.status];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="API 653 Fig. B.11 and B.12 allowable edge settlement">
      <g className="edge-grid">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
          <line key={b} x1={ml} x2={W - mr} y1={Y(b)} y2={Y(b)} />
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((r) => (
          <line key={r} x1={X(r)} x2={X(r)} y1={mt} y2={H - mb} />
        ))}
      </g>
      <g className="edge-axis" fontSize="9">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((b) => (
          <text key={b} x={ml - 6} y={Y(b) + 3} textAnchor="end">
            {b}
          </text>
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((r) => (
          <text key={r} x={X(r)} y={H - mb + 13} textAnchor="middle">
            {r}
          </text>
        ))}
        <text x={(ml + W - mr) / 2} y={H - 4} textAnchor="middle">
          R, settled width (ft)
        </text>
        <text x={10} y={(mt + H - mb) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(mt + H - mb) / 2})`}>
          B, max settlement (in)
        </text>
      </g>
      <path d={path((p) => p.Be)} className="edge-curve be" />
      <path d={path((p) => p.Bew)} className="edge-curve bew" />
      {angled && <path d={path(governing)} className="edge-curve gov" />}
      <path d={path((p) => {
        const g = governing(p);
        return g === null ? null : g * 0.75;
      })} className="edge-curve nde" />
      <g fontSize="9" fontWeight={600}>
        <text x={X(5.95)} y={Y(edgeAllow(TANK_D_FT, 5.95).Be!) - 5} textAnchor="end" className="edge-lab be">
          Be (Fig. B.12)
        </text>
        <text x={X(5.95)} y={Y(edgeAllow(TANK_D_FT, 5.95).Bew!) + 12} textAnchor="end" className="edge-lab bew">
          Bew (Fig. B.11)
        </text>
        <text x={X(5.95)} y={Y(governing(pts[pts.length - 2])! * 0.75) + 12} textAnchor="end" className="edge-lab nde">
          75% (NDE)
        </text>
      </g>
      {st.R !== null && (
        <g>
          <circle cx={X(st.R / 12)} cy={Y(st.B)} r={6} fill={color} stroke="hsl(var(--card))" strokeWidth={2} />
          <text x={X(st.R / 12) + 9} y={Y(st.B) - 7} fontSize="10" fontWeight={700} fill={color}>
            S{st.no}
          </text>
        </g>
      )}
    </svg>
  );
}

type Props = { station: number; onClose: () => void; onPick: (no: number) => void };

/** Close-up of one settlement station: cross-section and the Annex B check. */
export default function EdgeStationPanel({ station, onClose, onPick }: Props) {
  const st = edgeStations.find((s) => s.no === station) ?? edgeStations[0];
  const n = edgeStations.length;
  const color = statusColor[st.status];
  const weld =
    st.weld.kind === 'par'
      ? 'Parallel to shell'
      : st.weld.kind === 'perp'
        ? 'Perpendicular to shell'
        : `At ${st.weld.alpha}° to the shell`;
  return (
    <section className="edge-panel" aria-label={`Edge settlement, station ${st.no}`}>
      <header className="flex items-center gap-2">
        <button className="tool-button !p-1.5" onClick={() => onPick(((st.no - 2 + n) % n) + 1)} aria-label="Previous station">
          <ChevronLeft size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Edge settlement · API 653 Annex B</div>
          <h3 className="font-display text-base font-semibold">
            Station {st.no} · {st.deg}°
          </h3>
        </div>
        <button className="tool-button !p-1.5" onClick={() => onPick((st.no % n) + 1)} aria-label="Next station">
          <ChevronRight size={14} />
        </button>
        <button className="tool-button !p-1.5" onClick={onClose} aria-label="Close station">
          <X size={14} />
        </button>
      </header>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="edge-chip" style={{ background: color }}>
          {st.status}
          {st.pct !== null && ` · ${Math.round(st.pct)}%`}
        </span>
        {st.R !== null && (
          <span className="font-mono text-muted-foreground">
            B {f2(st.B)} in · R {ft(st.R)} ft · allowable {f2(st.allow!)} in
          </span>
        )}
      </div>
      <h4 className="edge-h">Cross-section at the station</h4>
      <Profile st={st} />
      <h4 className="edge-h">Compared with Fig. B.11 / B.12 ({TANK_D_FT} ft tank)</h4>
      <AnnexB st={st} />
      <dl className="edge-facts">
        <dt>Bottom lap welds</dt>
        <dd>{weld}</dd>
        {st.R !== null && (
          <>
            <dt>Allowable basis</dt>
            <dd>{st.basis}</dd>
            <dt>Bew / Be at R</dt>
            <dd className="font-mono">
              {f2(st.Bew!)} in / {f2(st.Be!)} in
            </dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{statusNote[st.status]}</p>
      <p className="mt-2 border-t border-border pt-2 text-[9px] text-muted-foreground">
        Illustrative survey. Unsettled plane fitted through the outer readings; breakover within 1/8 in of the plane.
      </p>
    </section>
  );
}
