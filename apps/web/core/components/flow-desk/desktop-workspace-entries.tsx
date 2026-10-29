import { Fragment, type ReactNode } from "react";
import { BookOpen, MessageSquareText, Settings } from "lucide-react";
import { WorkflowsPropertyIcon } from "@plane/propel/icons";
import { Link, useLocation, useParams } from "react-router";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { desktopApi } from "@/services/flow-desk/workbench";

function DesktopSidebarRow({
  href,
  label,
  active,
  icon,
  iconName,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  iconName?: string;
}) {
  return (
    <Link to={href} data-icon={iconName}>
      <SidebarNavItem isActive={active}>
        <div className="flex items-center gap-1.5 py-[1px]">
          {icon}
          <p className="text-13 leading-5 font-medium">{label}</p>
        </div>
      </SidebarNavItem>
    </Link>
  );
}

/** G1b: always visible on web (:8080) and desktop — links to settings embed (no n8n). */
export function DesktopOrchestrationEntry() {
  const { workspaceSlug } = useParams();
  const { pathname, search } = useLocation();
  if (!workspaceSlug) return null;
  const view = new URLSearchParams(search).get("view");
  const path = pathname.replace(/\/$/, "");
  const onDesktop = path.endsWith("/desktop");
  const onSettingsFlows = path.includes("/settings/flow-desk");
  return (
    <>
      <DesktopSidebarRow
        href={`/${workspaceSlug}/settings/flow-desk/orchestrator-flows`}
        label="编排"
        active={onSettingsFlows || (onDesktop && (view === "orchestrator-flows" || view === "flow-editor"))}
        icon={<WorkflowsPropertyIcon className="size-4 shrink-0 text-current" />}
      />
      {desktopApi() ? (
        <DesktopSidebarRow
          href={`/${workspaceSlug}/desktop?view=n8n`}
          label="n8n(旧)"
          active={onDesktop && view === "n8n"}
          icon={<WorkflowsPropertyIcon className="size-4 shrink-0 text-current opacity-60" />}
        />
      ) : null}
    </>
  );
}

export function DesktopCatalogEntries() {
  const { workspaceSlug } = useParams();
  const { pathname, search } = useLocation();
  if (!desktopApi() || !workspaceSlug) return null;
  const view = new URLSearchParams(search).get("view");
  const onDesktop = pathname.replace(/\/$/, "").endsWith("/desktop");
  return (
    <>
      <DesktopSidebarRow
        href={`/${workspaceSlug}/desktop?view=skills`}
        label="技能"
        active={onDesktop && view === "skills"}
        icon={<BookOpen className="size-4 shrink-0" />}
        iconName="skill"
      />
      <DesktopSidebarRow
        href={`/${workspaceSlug}/desktop?view=prompts`}
        label="提示词"
        active={onDesktop && view === "prompts"}
        icon={<MessageSquareText className="size-4 shrink-0" />}
        iconName="prompt"
      />
    </>
  );
}

export function DesktopStaticItems<T extends { key: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
}) {
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {renderItem(item, index)}
          {item.key === "home" ? (
            <>
              <DesktopOrchestrationEntry />
              <DesktopCatalogEntries />
            </>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

export function DesktopSidebarFooter() {
  const { workspaceSlug } = useParams();
  const { pathname } = useLocation();
  if (!workspaceSlug) return null;
  const path = pathname.replace(/\/$/, "");
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-subtle px-3 pt-2 pb-3">
      <DesktopSidebarRow
        href={`/${workspaceSlug}/settings`}
        label="设置"
        active={path === `/${workspaceSlug}/settings` || path.startsWith(`/${workspaceSlug}/settings/`)}
        icon={<Settings className="size-4 shrink-0" />}
      />
    </div>
  );
}
