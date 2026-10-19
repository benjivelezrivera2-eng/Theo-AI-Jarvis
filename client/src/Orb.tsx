import type { OrbState } from "./realtime";

type Props = {
  state: OrbState;
};

export function Orb({ state }: Props) {
  return (
    <div className={`orb-wrap state-${state}`} aria-hidden>
      <div className="orb-ring ring-a" />
      <div className="orb-ring ring-b" />
      <div className="orb-ring ring-c" />
      <div className="orb-core">
        <span className="orb-label">THEO</span>
      </div>
    </div>
  );
}
