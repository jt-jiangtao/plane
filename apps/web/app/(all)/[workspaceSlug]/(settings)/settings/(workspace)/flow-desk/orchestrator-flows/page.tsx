import { OrchestratorFlowEditorEmbed } from "@/components/flow-desk/orchestrator-flow-editor-embed";

/** Workspace settings entry for orchestrator YAML flow editor (G1b). */
export default function OrchestratorFlowsSettingsPage() {
  return (
    <div className="h-[calc(100vh-4rem)] w-full p-0">
      <OrchestratorFlowEditorEmbed />
    </div>
  );
}
