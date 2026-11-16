const lightVariables = {
  primaryColor: '#ffffff',
  primaryTextColor: '#1d1d1f',
  primaryBorderColor: '#1d1d1f',
  lineColor: '#6e6e73',
  secondaryColor: '#f5f5f7',
  tertiaryColor: '#f5f5f7',
  background: '#ffffff',
  mainBkg: '#ffffff',
  secondBkg: '#f5f5f7',
  tertiaryBkg: '#f5f5f7',
  clusterBkg: '#f5f5f7',
  clusterBorder: '#d2d2d7',
  edgeLabelBackground: '#ffffff',
  nodeBorder: '#1d1d1f',
  actorBkg: '#ffffff',
  actorBorder: '#1d1d1f',
  actorTextColor: '#1d1d1f',
  signalColor: '#6e6e73',
  signalTextColor: '#1d1d1f',
  labelBoxBkgColor: '#f5f5f7',
  labelBoxBorderColor: '#d2d2d7',
  noteBkgColor: '#f5f5f7',
  noteBorderColor: '#d2d2d7',
  noteTextColor: '#1d1d1f',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
  fontSize: '13px',
};

const darkVariables = {
  ...lightVariables,
  primaryColor: '#1c1c1e',
  primaryTextColor: '#f5f5f7',
  primaryBorderColor: '#8e8e93',
  lineColor: '#8e8e93',
  secondaryColor: '#2c2c2e',
  tertiaryColor: '#2c2c2e',
  background: '#1c1c1e',
  mainBkg: '#1c1c1e',
  secondBkg: '#2c2c2e',
  tertiaryBkg: '#2c2c2e',
  clusterBkg: '#2c2c2e',
  clusterBorder: '#3a3a3c',
  edgeLabelBackground: '#1c1c1e',
  nodeBorder: '#8e8e93',
  actorBkg: '#1c1c1e',
  actorBorder: '#8e8e93',
  actorTextColor: '#f5f5f7',
  signalColor: '#8e8e93',
  signalTextColor: '#f5f5f7',
  labelBoxBkgColor: '#2c2c2e',
  labelBoxBorderColor: '#3a3a3c',
  noteBkgColor: '#2c2c2e',
  noteBorderColor: '#3a3a3c',
  noteTextColor: '#f5f5f7',
};

export async function renderMermaidSvg(
  chart: string,
  theme: 'light' | 'dark',
  id: string,
): Promise<string> {
  const module = await import('mermaid');
  const mermaid = module.default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: theme === 'dark' ? darkVariables : lightVariables,
    fontFamily: lightVariables.fontFamily,
    suppressErrorRendering: true,
  });
  await mermaid.parse(chart);
  const result = await mermaid.render(id, chart);
  return result.svg;
}
