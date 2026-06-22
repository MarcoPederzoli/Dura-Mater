"use strict";

/**
 * Genera Regolamento-Dura.docx — solo Dura Mater (competitiva + torneo).
 * Uso: node scripts/build-regolamento-dura-docx.js
 */

const fs = require("node:fs");
const path = require("node:path");

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} = require("docx");

const OUT = path.join(__dirname, "..", "Regolamento-Dura.docx");

const CONTENT_W = 9026;
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}

function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    alignment: opts.center ? AlignmentType.CENTER : undefined,
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italic, size: opts.size })]
  });
}

function bullet(ref, text) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 80 },
    children: [new TextRun(text)]
  });
}

function table(headers, rows) {
  const cols = headers.length;
  const colW = Math.floor(CONTENT_W / cols);
  const columnWidths = Array.from({ length: cols }, () => colW);
  const headerRow = new TableRow({
    children: headers.map(text =>
      new TableCell({
        borders,
        width: { size: colW, type: WidthType.DXA },
        shading: { fill: "D5E8F0", type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })]
      })
    )
  });
  const bodyRows = rows.map(row =>
    new TableRow({
      children: row.map(text =>
        new TableCell({
          borders,
          width: { size: colW, type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ children: [new TextRun(text)] })]
        })
      )
    })
  );
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths,
    rows: [headerRow, ...bodyRows]
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun("Dura Mater — Regolamento  ·  Pagina "),
            new TextRun({ children: [PageNumber.CURRENT] })
          ]
        })]
      })
    },
    children: [
      new Paragraph({ spacing: { after: 400 } }),
      p("DURA MATER", { bold: true, size: 48, center: true }),
      p("Regolamento di gioco", { size: 32, center: true }),
      p("Partita competitiva e torneo a punteggio", { italic: true, center: true }),
      p("Versione giugno 2026", { italic: true, center: true }),

      h1("Panoramica"),
      p(
        "Dura Mater e' un gioco di carte per 2-16 giocatori (a seconda della griglia). " +
        "Si costruisce una griglia NxN posando carte compatibili. " +
        "Obiettivo: svuotare per primo la propria mano."
      ),
      bullet("bullets", "Il solitario non fa parte di Dura Mater (minimo 2 giocatori)."),
      bullet("bullets", "La variante Durissima Mater (cooperativa/solitario) ha regolamento separato."),

      h1("Componenti e carte"),
      bullet("bullets", "Mazzo di 64 carte (codice a tre cifre: valore, forma, colore)."),
      bullet("bullets", "Con griglia NxN si usano le carte con Valore <= N (esattamente N^2 carte)."),
      p("Valore 1-8 (Asso-Otto); forme e colori secondo la scheda di riferimento."),

      h1("Preparazione"),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Scegliete N (3-8) e G giocatori (2-2N).")]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Mescolate le N^2 carte con Valore <= N.")]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 80 },
        children: [new TextRun("Distribuite: se G <= N, N carte ciascuno; se G > N, ripartizione uguale e tallone.")]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 120 },
        children: [new TextRun("Minimo 3 carte a testa. Formato ideale: G = N (nessun tallone).")]
      }),
      p("G_min consigliato = ceil(N/2); eccezione 7x7 -> 3 giocatori."),

      h1("Regole di posa"),
      bullet("bullets", "Prima carta: posa libera. Poi solo adiacenze ortogonali."),
      bullet("bullets", "Almeno un tratto in comune (valore, forma o colore) con ogni adiacente."),
      bullet("bullets", "Nel turno: 1a posa req. 1, 2a req. 2, 3a req. 3, 4a req. 4."),
      bullet("bullets", "La griglia non supera mai N righe e N colonne."),

      h2("Dura Mater e inversione"),
      bullet("bullets", "1o limite: fila o colonna di N carte -> inversione ordine di gioco."),
      bullet("bullets", "2o limite: ingombro NxN (chiusura) -> seconda inversione."),
      bullet("bullets", "Due limiti nello stesso turno: le inversioni si annullano."),

      h2("Idea (quinta carta cieca)"),
      bullet("bullets", "Dopo 4 pose legali: opzionale 5a carta a faccia in giu' (jolly topologico)."),
      bullet("bullets", "Solo adiacenza + limiti Dura Mater; nessun vincolo di tratto sulla posa."),
      bullet("bullets", "Per i legami e' un buco nella griglia (non conta come vicino), come il bordo."),
      bullet("bullets", "Dopo: non si posa solo sul jolly; serve un vicino scoperto con tratto in comune."),
      bullet("bullets", "Competitiva/torneo: carta nota solo a chi posa; coop Durissima: nota a tutti."),
      bullet("bullets", "Nessuna pesca tra 4a e 5a carta."),

      h1("Turno e pesca"),
      bullet("bullets", "Da 1 a 4 carte per turno (+ Idea). Si puo' chiudere prima del massimo."),
      bullet("bullets", "Fine turno: pescate 1 carta se il tallone non e' vuoto — anche dopo un passo."),
      bullet("bullets", "Monte: G turni consecutivi senza posate da nessuno (anche con tallone pieno)."),

      h1("Vittoria (partita libera)"),
      bullet("bullets", "Vince chi svuota per primo la mano."),
      bullet("bullets", "Vittoria alla posa che svuota, prima della pesca di fine turno."),

      h1("Torneo a punteggio"),
      p("Stesse regole di gioco; punteggio e fine mano diversi."),
      bullet("bullets", "Sede fissa per tutto il torneo; rotazione del primo giocatore ogni mano."),
      bullet("bullets", "Chi finisce: punti = giocatori ancora in gioco (1o = G, 2o = G-1, ...)."),
      bullet("bullets", "Idea (torneo): +1 alla 4a carta legale del turno."),
      bullet("bullets", "Monte: -1 per ogni carta ancora in mano (tallone escluso)."),
      bullet("bullets", "Formato naturale: G mani; oppure punteggio bersaglio concordato."),

      h1("Riepilogo"),
      table(
        ["Aspetto", "Regola"],
        [
          ["Giocatori", "2 ... 2N"],
          ["Obiettivo", "Mano vuota per primo"],
          ["Pesca", "Sempre a fine turno (se tallone non vuoto)"],
          ["Torneo", "Si"],
          ["Durissima", "Regolamento separato"]
        ]
      ),
      new Paragraph({ spacing: { after: 240 } }),
      p("Buon gioco!", { bold: true, center: true })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUT, buffer);
  process.stdout.write(`Scritto: ${OUT}\n`);
});