import {
  AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph,
  Table, TableCell, TableRow, TextRun, WidthType
} from 'docx';
import mermaid from 'mermaid';
import { BLUEPRINT_SECTIONS } from '../config/blueprintSections';

const plain = (value = '') => value
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[(.*?)\]\([^)]+\)/g, '$1')
  .trim();

const svgToPng = (svg) => new Promise((resolve, reject) => {
  const image = new Image();
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  image.onload = () => {
    const width = Math.min(1400, Math.max(700, image.naturalWidth || 900));
    const height = Math.min(900, Math.max(350, image.naturalHeight || 500));
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(2, 2);
    context.drawImage(image, 0, 0, width, height);
    canvas.toBlob(async blob => {
      if (!blob) return reject(new Error('Diagram image conversion failed.'));
      resolve({ data: await blob.arrayBuffer(), width: 620, height: Math.round(620 * height / width) });
    }, 'image/png');
  };
  image.onerror = reject;
  image.src = source;
});

const renderDiagram = async (chart, index) => {
  try {
    const { svg } = await mermaid.render(`docx-mermaid-${Date.now()}-${index}`, chart);
    const png = await svgToPng(svg);
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: png.data, transformation: { width: png.width, height: png.height }, type: 'png' })]
    });
  } catch (error) {
    return new Paragraph({ children: [new TextRun({ text: `Diagram source (render failed: ${error.message})`, italics: true })] });
  }
};

const markdownBlocks = async (markdown, diagramOffset) => {
  const children = [];
  const lines = String(markdown || '').split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (/^```mermaid\s*$/.test(line.trim())) {
      const diagram = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) diagram.push(lines[index++]);
      children.push(await renderDiagram(diagram.join('\n'), diagramOffset + children.length));
      index += 1;
      continue;
    }
    if (/^```/.test(line.trim())) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) code.push(lines[index++]);
      children.push(new Paragraph({ children: [new TextRun({ text: code.join('\n'), font: 'Courier New', size: 18 })] }));
      index += 1;
      continue;
    }
    if (/^\|.+\|\s*$/.test(line) && index + 1 < lines.length && /^\|?\s*:?-+/.test(lines[index + 1])) {
      const rows = [line];
      index += 2;
      while (index < lines.length && /^\|.+\|\s*$/.test(lines[index])) rows.push(lines[index++]);
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map((row, rowIndex) => new TableRow({ children: row.split('|').slice(1, -1).map(cell => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: plain(cell), bold: rowIndex === 0 })] })]
        })) }))
      }));
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const levels = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      children.push(new Paragraph({ text: plain(heading[2]), heading: levels[heading[1].length - 1] }));
    } else if (/^[-*]\s+/.test(line)) {
      children.push(new Paragraph({ text: plain(line.replace(/^[-*]\s+/, '')), bullet: { level: 0 } }));
    } else if (/^\d+\.\s+/.test(line)) {
      children.push(new Paragraph({ text: plain(line.replace(/^\d+\.\s+/, '')), numbering: { reference: 'blueprint-numbering', level: 0 } }));
    } else if (line.trim()) {
      children.push(new Paragraph({ children: [new TextRun({ text: plain(line) })], spacing: { after: 120 } }));
    }
    index += 1;
  }
  return children;
};

export const createBlueprintDocx = async (project, blueprint) => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
  const children = [
    new Paragraph({ text: project?.name || 'Startup Blueprint', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: 'Startup Blueprint', subtitle: true })
  ];
  let diagramOffset = 0;
  for (const section of BLUEPRINT_SECTIONS) {
    children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: children.length > 2 }));
    children.push(...await markdownBlocks(blueprint?.[section.id]?.content || '_No content generated._', diagramOffset));
    diagramOffset += 10;
  }
  const document = new Document({
    numbering: { config: [{ reference: 'blueprint-numbering', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }] }] },
    sections: [{ properties: {}, children }]
  });
  return Packer.toBlob(document);
};
