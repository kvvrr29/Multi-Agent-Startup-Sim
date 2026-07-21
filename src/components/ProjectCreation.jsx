import { useState } from "react";
import { useProjectStore } from "../store/useProjectStore";
import { runInitialSimulation } from "../services/simulationEngine";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  Settings,
} from "lucide-react";
import { AIStatusBanner } from "./AIStatusUtils";
import AISettingsModal from "./AISettingsModal";
import { useAuthStore } from "../store/useAuthStore";
import { createCloudProject } from "../services/cloudSync";
import SplitPanelLayout from "./SplitPanelLayout";

const STEPS = [
  {
    title: "Describe the idea",
    description: "Name it and tell us what you want to build.",
  },
  {
    title: "Agents plan it out",
    description: "Scope, stack, and milestones drafted for you.",
  },
  {
    title: "Review the blueprint",
    description: "Get a build-ready plan you can iterate on.",
  },
];

export default function ProjectCreation() {
  const currentProject = useProjectStore((state) => state.project);
  const setCurrentView = useProjectStore((state) => state.setCurrentView);
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [showSettings, setShowSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    idea: "",
    targetAudience: "",
    budget: "",
    timeline: "",
    platform: "web",
    teamSize: "",
    priorities: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (formData.name.trim().length < 3) {
      setError("Project name must be at least 3 characters long.");
      return;
    }
    if (formData.idea.trim().length < 15) {
      setError(
        "Startup idea is too short. Please provide a detailed description (min 15 chars).",
      );
      return;
    }
    if (!formData.targetAudience.trim() || !formData.budget.trim()) {
      setError("Please fill out all required fields (Audience, Budget).");
      return;
    }

    setError("");
    setCreating(true);

    const cloudId = await createCloudProject(formData);
    setCreating(false);
    if (!cloudId) {
      setError(
        "Could not save the project to your account. Check your connection and try again.",
      );
      return;
    }

    runInitialSimulation(formData);
  };

  return (
    <>
      {showSettings && (
        <AISettingsModal onClose={() => setShowSettings(false)} />
      )}

      <SplitPanelLayout
        eyebrow="New workspace"
        title={<>Start a<br />new project</>}
        description="Define your startup vision, and our AI agents will turn it into a working blueprint."
        items={STEPS}
      >
        <div className="project-create-workspace">
          <header className="project-create-toolbar">
            {currentProject ? (
              <button
                type="button"
                className="project-create-text-button"
                onClick={() => setCurrentView("dashboard")}
              >
                <ArrowLeft size={15} /> Back to dashboard
              </button>
            ) : (
              <span />
            )}

            <div className="project-create-actions">
              <button
                type="button"
                title="AI settings"
                onClick={() => setShowSettings(true)}
                className="project-create-utility-button"
              >
                <Settings size={15} /> AI Settings
              </button>
              <button
                type="button"
                title={`Sign out ${user?.email || ""}`}
                onClick={signOut}
                className="project-create-utility-button"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </header>

          <div className="project-create-form-wrap">
            <div className="project-create-mobile-heading">
              <span className="project-create-kicker">New workspace</span>
              <h1>Start a new project</h1>
              <p>Tell us what you want to build. We’ll plan the rest.</p>
            </div>

            <AIStatusBanner />

            {error && (
              <div className="project-create-error" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="project-create-form">
              <div className="project-create-field">
                <label htmlFor="name">
                  Project Name <span>*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., Acora"
                  required
                />
              </div>

              <div className="project-create-field">
                <label htmlFor="idea">
                  Startup Idea <span>*</span>
                </label>
                <textarea
                  id="idea"
                  name="idea"
                  value={formData.idea}
                  onChange={handleChange}
                  placeholder="Describe what you want to build — the problem, who it’s for, and what makes it different…"
                  required
                  rows={5}
                />
              </div>

              <div className="project-create-section-heading">
                <span>Project details</span>
                <small>Audience and budget are required</small>
              </div>

              <div className="project-create-grid project-create-grid-two">
                <div className="project-create-field">
                  <label htmlFor="targetAudience">
                    Target Audience <span>*</span>
                  </label>
                  <input
                    type="text"
                    id="targetAudience"
                    name="targetAudience"
                    value={formData.targetAudience}
                    onChange={handleChange}
                    placeholder="e.g., College students"
                    required
                  />
                </div>

                <div className="project-create-field">
                  <label htmlFor="budget">
                    Budget <span>*</span>
                  </label>
                  <input
                    type="text"
                    id="budget"
                    name="budget"
                    value={formData.budget}
                    onChange={handleChange}
                    placeholder="e.g., $10k"
                    required
                  />
                </div>
              </div>

              <div className="project-create-grid project-create-grid-three">
                <div className="project-create-field">
                  <label htmlFor="timeline">Timeline</label>
                  <input
                    type="text"
                    id="timeline"
                    name="timeline"
                    value={formData.timeline}
                    onChange={handleChange}
                    placeholder="e.g., 6 months"
                  />
                </div>

                <div className="project-create-field">
                  <label htmlFor="platform">Platform</label>
                  <select
                    id="platform"
                    name="platform"
                    value={formData.platform}
                    onChange={handleChange}
                  >
                    <option value="web">Web</option>
                    <option value="mobile">Mobile</option>
                    <option value="web + mobile">Web + Mobile</option>
                    <option value="desktop">Desktop</option>
                  </select>
                </div>

                <div className="project-create-field">
                  <label htmlFor="teamSize">Team Size</label>
                  <input
                    type="text"
                    id="teamSize"
                    name="teamSize"
                    value={formData.teamSize}
                    onChange={handleChange}
                    placeholder="e.g., 4"
                  />
                </div>
              </div>

              <div className="project-create-field">
                <label htmlFor="priorities">Priorities</label>
                <input
                  type="text"
                  id="priorities"
                  name="priorities"
                  value={formData.priorities}
                  onChange={handleChange}
                  placeholder="e.g., Fast launch, low running costs"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="project-create-submit"
              >
                <span>
                  {creating ? "Creating blueprint…" : "Generate Blueprint"}
                </span>
                <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      </SplitPanelLayout>
    </>
  );
}
