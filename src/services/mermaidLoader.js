// Mermaid is ~600 kB of the bundle and only matters once a diagram section
// exists, so it is pulled in on first render instead of at module load.
let mermaidPromise = null;

export const loadMermaid = () => {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "strict",
      fontFamily: "Inter, sans-serif",
      themeVariables: {
        background: "#171717",
        primaryColor: "#303030",
        primaryTextColor: "#f5f5f5",
        primaryBorderColor: "#8c8c8c",
        secondaryColor: "#2b2b2b",
        tertiaryColor: "#1f1f1f",
        lineColor: "#a3a3a3",
        textColor: "#f5f5f5",
        mainBkg: "#303030",
        nodeBorder: "#8c8c8c",
        clusterBkg: "#1f1f1f",
        clusterBorder: "#555555",
        edgeLabelBackground: "#171717",
      },
      suppressErrorRendering: true,
    });
    return mermaid;
  });
  return mermaidPromise;
};
