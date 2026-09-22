/** Six activity categories sharing a selectable rolling time window. */
import { useEffect, useState } from "preact/hooks";
import type { JSX } from "preact";
import type { CoreEvent } from "../../api/types";
import { Icon } from "../../components/Icon";
import { t } from "../../stores/i18n";
import { CATEGORY_META, TILE_CATEGORIES, type EventCategory } from "./event-meta";
import { buildTileData, type ActivityWindow, type TileData } from "./activity-window";
import { Sparkline } from "./Sparkline";

interface ActivityDashboardProps {
  events: readonly CoreEvent[];
  minutes: ActivityWindow;
}

function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, Math.round((now - ts) / 1000));
  if (diff < 5) return t("common.justNow");
  if (diff < 60) return t("common.secondsAgo", { n: diff });
  const m = Math.round(diff / 60);
  if (m < 60) return t("common.minutesAgo", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("common.hoursAgo", { n: h });
  const d = Math.round(h / 24);
  return t("common.daysAgo", { n: d });
}

export function ActivityDashboard({ events, minutes }: ActivityDashboardProps): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, [minutes, events]);
  const windowLabel = minutes === 60
    ? t("overview.live.window.hour")
    : t("overview.live.window.minutes", { n: minutes });

  return (
    <div class="dash-grid" role="list">
      {TILE_CATEGORIES.map((cat) => (
        <Tile key={cat} cat={cat} data={buildTileData(events, cat, now, minutes)} now={now} windowLabel={windowLabel} />
      ))}
    </div>
  );
}

interface TileProps {
  cat: EventCategory;
  data: TileData;
  now: number;
  windowLabel: string;
}

function Tile({ cat, data, now, windowLabel }: TileProps): JSX.Element {
  const meta = CATEGORY_META[cat];
  return (
    <div class={`dash-tile cat--${cat}`} role="listitem">
      <div class="dash-tile__head">
        <span class="dash-tile__icon" aria-hidden="true">
          <Icon name={meta.icon} size={16} />
        </span>
        <span class="dash-tile__name">{t(meta.labelKey as never)}</span>
      </div>
      <div class="dash-tile__count">
        <span class="dash-tile__count-n">{data.count}</span>
        <span class="dash-tile__count-unit">{t("overview.live.tile.count", { window: windowLabel })}</span>
      </div>
      <div class="dash-tile__spark">
        <Sparkline
          buckets={data.buckets}
          ariaLabel={`${t(meta.labelKey as never)} · ${windowLabel} · ${data.count}`}
        />
      </div>
      <div class="dash-tile__last">
        {data.last ? (
          <>
            <strong>{data.last.title}</strong>
            <span class="dash-tile__last-line">
              {data.last.detail
                ? `${data.last.detail} · ${formatRelative(data.last.evt.ts, now)}`
                : formatRelative(data.last.evt.ts, now)}
            </span>
          </>
        ) : (
          <span class="dash-tile__last-empty">{t("overview.live.tile.empty", { window: windowLabel })}</span>
        )}
      </div>
    </div>
  );
}
