import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx-js-style";


type Card = { id: string; prestador: string; qtd: number; hora?: string };
type Column = { id: string; title: string; cards: Card[]; locked?: boolean };
type BoardState = { cols: Column[] };
type Editing = { colId: string; cardId: string | null };

type ProviderGroup = {
  id: string;
  name: string;
  providers: string[];
};

type BlockedProvider = {
  id: string;
  provider: string;
  columnId: string;
};

type AutoFillRules = {
  groups: ProviderGroup[];
  blocked: BlockedProvider[];
};

const RULES_KEY = "calendario-autofill-rules";

const emptyRules: AutoFillRules = {
  groups: [],
  blocked: [],
};

function loadRules(): AutoFillRules {
  try {
    const saved = localStorage.getItem(RULES_KEY);
    return saved ? JSON.parse(saved) : emptyRules;
  } catch {
    return emptyRules;
  }
}

const STORAGE_KEY = "conferencia-v1";

const uid = () => Math.random().toString(36).slice(2, 10);

function createDefaults(): BoardState {
  return {
    cols: [
      // Coluna fixa: recebe os dados do Excel e não pode ser excluída.
      { id: "entrada", title: "Entrada (Excel)", cards: [], locked: true },
    ],
  };
}

function loadBoard(): BoardState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaults();
    const parsed = JSON.parse(saved) as BoardState;
    // Garante que o formato é válido e que a coluna fixa existe.
    if (!Array.isArray(parsed.cols) || !parsed.cols.some((col) => col.locked)) {
      return createDefaults();
    }
    return parsed;
  } catch {
    return createDefaults();
  }
}

/* ------------------------------------------------------------------ */
/*  ETL: relatório "CISBAF x Marque Fácil" (modelo sintético).         */
/*  O arquivo vem em blocos:                                           */
/*    FORNECEDOR: <nome>                                               */
/*    Data | Procedimento | Quantidade | ...  (uma linha por data/proc)*/
/*    Total do grupo: ...                                              */
/*  Para cada fornecedor, soma a coluna "Quantidade" de todas as       */
/*  linhas de procedimento (não conta quantas linhas existem).         */
/* ------------------------------------------------------------------ */
const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  const n = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const isDate = (text: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(text);

function transformRows(rows: unknown[][]): Omit<Card, "id">[] {
  const cards: Omit<Card, "id">[] = [];
  let current: { prestador: string; qtd: number } | null = null;

  for (const row of rows) {
    const first = String(row[0] ?? "").trim();

    if (first.toUpperCase().startsWith("FORNECEDOR:")) {
      current = { prestador: first.slice(first.indexOf(":") + 1).trim(), qtd: 0 };
      cards.push(current);
    } else if (current && isDate(first)) {
      current.qtd += toNumber(row[2]); // coluna "Quantidade"
    }
  }

  return cards;
}

export default function App() {
  const [board, setBoard] = useState<BoardState>(loadBoard);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [prestador, setPrestador] = useState("");
  const [qtd, setQtd] = useState("0");
  const [dragging, setDragging] = useState<{ cardId: string; fromCol: string } | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [showTable, setShowTable] = useState(false);
  const [overCell, setOverCell] = useState<string | null>(null);

  const visibleCols = board.cols.filter((col) => !col.locked);

  const [rules, setRules] = useState<AutoFillRules>(loadRules);
  const [showRules, setShowRules] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const [blockedProvider, setBlockedProvider] = useState("");
  const [blockedColumn, setBlockedColumn] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [providerListOpen, setProviderListOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  }, [rules]);

  function addGroup() {
    if (!groupName.trim() || selectedProviders.length < 2) {
      alert("Informe um nome e selecione pelo menos dois prestadores.");
      return;
    }

    // Verifica se algum prestador já pertence a outro grupo.
    const alreadyGrouped = rules.groups.flatMap(
      (group) => group.providers
    );

    const hasDuplicate = selectedProviders.some((provider) =>
      alreadyGrouped.some(
        (name) =>
          name.trim().toLowerCase() ===
          provider.trim().toLowerCase()
      )
    );

    if (hasDuplicate) {
      alert("Um ou mais prestadores já pertencem a outro grupo.");
      return;
    }

    // Cria o grupo.
    setRules((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: uid(),
          name: groupName.trim(),
          providers: selectedProviders,
        },
      ],
    }));

    setGroupName("");
    setSelectedProviders([]);
  }

  function addBlockedProvider() {
    if (!blockedProvider || !blockedColumn) return;

    const exists = rules.blocked.some(
      (rule) =>
        rule.provider === blockedProvider &&
        rule.columnId === blockedColumn
    );

    if (exists) return;

    setRules((current) => ({
      ...current,
      blocked: [
        ...current.blocked,
        {
          id: uid(),
          provider: blockedProvider,
          columnId: blockedColumn,
        },
      ],
    }));

    setBlockedProvider("");
    setBlockedColumn("");
  }

  function removeGroup(id: string) {
    setRules((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== id),
    }));
  }

  function removeBlocked(id: string) {
    setRules((current) => ({
      ...current,
      blocked: current.blocked.filter((rule) => rule.id !== id),
    }));
  }

  function autoFill() {
    const source = board.cols.find((col) => col.locked);
    const days = visibleCols;

    if (!source) {
      alert("Coluna de entrada não encontrada.");
      return;
    }

    // Reúne os prestadores da entrada e de todas as datas.
    const cards = board.cols.flatMap((col) => col.cards);

    if (cards.length === 0) {
      alert("Importe os prestadores antes de preencher.");
      return;
    }

    if (days.length === 0) {
      alert("Crie pelo menos uma data.");
      return;
    }

    // Monta os grupos inseparáveis.
    const groupedIds = new Set<string>();

    const units: Card[][] = [];

    rules.groups
      .forEach((group) => {
        const members = cards.filter((card) =>
          group.providers.some(
            (name) =>
              name.trim().toLowerCase() ===
              card.prestador.trim().toLowerCase()
          )
        );

        if (members.length > 0) {
          members.forEach((card) => groupedIds.add(card.id));
          units.push(members);
        }
      });

    // Prestadores que não pertencem a grupos inseparáveis.
    cards.forEach((card) => {
      if (!groupedIds.has(card.id)) {
        units.push([card]);
      }
    });

    // Calcula as restrições de cada unidade.
    const allocations = units.map((members) => ({
      members,
      total: members.reduce((sum, card) => sum + card.qtd, 0),
      eligibleDays: days.filter(
        (day) =>
          !members.some((card) =>
            rules.blocked.some(
              (rule) =>
                rule.provider.trim().toLowerCase() ===
                card.prestador.trim().toLowerCase() &&
                rule.columnId === day.id
            )
          )
      ),
    }));

    // Unidades com menos opções são processadas primeiro.
    allocations.sort(
      (a, b) =>
        a.eligibleDays.length - b.eligibleDays.length ||
        b.total - a.total
    );

    const totals = new Map<string, number>(
      days.map((day) => [day.id, 0])
    );

    const result = new Map<string, Card[]>(
      days.map((day) => [day.id, []])
    );

    for (const unit of allocations) {
      if (unit.eligibleDays.length === 0) {
        alert(
          `Não foi possível preencher: ${unit.members
            .map((card) => card.prestador)
            .join(", ")} não possui uma data permitida.`
        );
        return;
      }

      // Escolhe o dia com menor quantidade de procedimentos.
      const target = [...unit.eligibleDays].sort(
        (a, b) =>
          (totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0)
      )[0];

      result.get(target.id)!.push(...unit.members);

      totals.set(
        target.id,
        (totals.get(target.id) ?? 0) + unit.total
      );
    }

    // Atualiza o quadro somente após encontrar uma distribuição válida.
    setBoard((current) => ({
      ...current,
      cols: current.cols.map((col) => ({
        ...col,
        cards: col.locked
          ? []
          : result.get(col.id) ?? [],
      })),
    }));
  }

  function updateHora(colId: string, cardId: string, hora: string) {
    setBoard((current) => ({
      ...current,
      cols: current.cols.map((col) =>
        col.id === colId
          ? {
            ...col,
            cards: col.cards.map((card) =>
              card.id === cardId ? { ...card, hora } : card,
            ),
          }
          : col,
      ),
    }));
  }

  const downloadTable = () => {
    if (visibleCols.length === 0) return;

    const maxRows = Math.max(1, ...visibleCols.map((col) => col.cards.length));

    const titleRow = visibleCols.flatMap((col) => [col.title, "", ""]);
    const labelRow = visibleCols.flatMap(() => ["PRESTADOR", "PROCEDIMENTOS", "HORA"]);
    const bodyRows = Array.from({ length: maxRows }, (_, index) =>
      visibleCols.flatMap((col) => {
        const card = col.cards[index];
        return [card?.prestador ?? "", card ? card.qtd : "", card?.hora ?? ""];
      }),
    );
    const totalRow = visibleCols.flatMap((col) => ["TOTAL", getColumnTotal(col), ""]);

    const data = [titleRow, labelRow, ...bodyRows, totalRow];
    const worksheet = XLSX.utils.aoa_to_sheet(data);

    const line = { style: "thin", color: { rgb: "D9D5CB" } };
    const border = { top: line, bottom: line, left: line, right: line };
    const center = { horizontal: "center", vertical: "center" };

    const titleStyle = {
      fill: { fgColor: { rgb: "1F6F6B" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      alignment: center,
      border,
    };
    const labelStyle = {
      fill: { fgColor: { rgb: "E9E6DF" } },
      font: { bold: true, color: { rgb: "20282B" }, sz: 10 },
      alignment: { horizontal: "left", vertical: "center" },
      border,
    };
    const textStyle = {
      font: { color: { rgb: "20282B" }, sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
      border,
    };
    const numberStyle = { ...textStyle, alignment: center, numFmt: "#,##0" };
    const horaStyle = { ...textStyle, alignment: center };
    const totalFill = { fgColor: { rgb: "E9E6DF" } };
    const totalFont = { bold: true, color: { rgb: "20282B" }, sz: 11 };

    const lastRow = data.length - 1;
    const lastCol = visibleCols.length * 3 - 1;

    for (let r = 0; r <= lastRow; r++) {
      for (let c = 0; c <= lastCol; c++) {
        const address = XLSX.utils.encode_cell({ r, c });
        const cell = (worksheet[address] = worksheet[address] ?? { t: "s", v: "" });
        const kind = c % 3; // 0 prestador, 1 procedimentos, 2 hora

        if (r === 0) cell.s = titleStyle;
        else if (r === 1) cell.s = kind === 0 ? labelStyle : { ...labelStyle, alignment: center };
        else if (r === lastRow) {
          const base = kind === 0 ? textStyle : kind === 1 ? numberStyle : horaStyle;
          cell.s = { ...base, font: totalFont, fill: totalFill };
        } else cell.s = kind === 0 ? textStyle : kind === 1 ? numberStyle : horaStyle;
      }
    }

    // Data mesclada em cima das 3 colunas, igual ao modal
    worksheet["!merges"] = visibleCols.map((_, index) => ({
      s: { r: 0, c: index * 3 },
      e: { r: 0, c: index * 3 + 2 },
    }));

    worksheet["!cols"] = visibleCols.flatMap(() => [{ wch: 35 }, { wch: 16 }, { wch: 10 }]);
    worksheet["!rows"] = [
      { hpt: 26 },
      { hpt: 22 },
      ...Array.from({ length: maxRows }, () => ({ hpt: 22 })),
      { hpt: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Relatório");
    XLSX.writeFile(workbook, "calendario-conferencia.xlsx");
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
    } catch {
      // O quadro continua funcionando mesmo se o armazenamento estiver indisponível.
    }
  }, [board]);

  const totalCards = useMemo(
    () => board.cols.reduce((sum, col) => sum + col.cards.length, 0),
    [board.cols],
  );

  const totalQtd = useMemo(
    () =>
      board.cols.reduce(
        (sum, col) => sum + col.cards.reduce((acc, card) => acc + card.qtd, 0),
        0,
      ),
    [board.cols],
  );

  const getColumnTotal = (col: Column) =>
    col.cards.reduce((sum, card) => sum + card.qtd, 0);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // permite reenviar o mesmo arquivo
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const newCards = transformRows(rows).map((card) => ({ id: uid(), ...card }));

      // Substitui tudo: limpa os cartões de todas as colunas e
      // coloca os novos na coluna fixa (as colunas em si são mantidas).
      setBoard((current) => ({
        ...current,
        cols: current.cols.map((col) => ({
          ...col,
          cards: col.locked ? newCards : [],
        })),
      }));
      setImportMsg(`Importado de "${file.name}"`);
    } catch {
      setImportMsg("Não foi possível ler o arquivo. Verifique se é um Excel válido.");
    }
  }

  function openDialog(colId: string, cardId: string | null = null) {
    const card = cardId
      ? board.cols.find((col) => col.id === colId)?.cards.find((item) => item.id === cardId)
      : undefined;
    setEditing({ colId, cardId });
    setPrestador(card?.prestador ?? "");
    setQtd(String(card?.qtd ?? 0));
  }

  function closeDialog() {
    setEditing(null);
    setPrestador("");
    setQtd("0");
  }

  function saveCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !prestador.trim()) return;

    setBoard((current) => ({
      ...current,
      cols: current.cols.map((col) => {
        if (col.id !== editing.colId) return col;
        const data = { prestador: prestador.trim(), qtd: Math.max(0, Number(qtd) || 0) };
        if (editing.cardId) {
          return {
            ...col,
            cards: col.cards.map((card) =>
              card.id === editing.cardId ? { ...card, ...data } : card,
            ),
          };
        }
        return { ...col, cards: [...col.cards, { id: uid(), ...data }] };
      }),
    }));
    closeDialog();
  }

  function clearAll() {
    if (totalCards === 0) return;
    if (!window.confirm(`Excluir todos os ${totalCards} cartões do quadro?`)) return;
    setBoard((current) => ({
      ...current,
      cols: current.cols.map((col) => ({ ...col, cards: [] })),
    }));
    setImportMsg(null);
  }

  function addColumn() {
    setBoard((current) => ({
      ...current,
      cols: [...current.cols, { id: uid(), title: "Nova coluna", cards: [] }],
    }));
  }

  function renameColumn(colId: string, value: string) {
    setBoard((current) => ({
      ...current,
      cols: current.cols.map((col) =>
        col.id === colId && !col.locked ? { ...col, title: value.trim() || "Sem nome" } : col,
      ),
    }));
  }

  function deleteColumn(col: Column) {
    if (col.locked) return;

    if (
      !window.confirm(
        col.cards.length
          ? `Excluir a data "${col.title}"? Os ${col.cards.length} prestadores voltarão para Entrada (Excel).`
          : `Excluir a data "${col.title}"?`
      )
    ) {
      return;
    }

    setBoard((current) => {
      const source = current.cols.find((item) => item.locked);

      if (!source) return current;

      const deletedColumn = current.cols.find(
        (item) => item.id === col.id
      );

      if (!deletedColumn) return current;

      return {
        ...current,
        cols: current.cols
          .filter((item) => item.id !== col.id)
          .map((item) =>
            item.locked
              ? {
                ...item,
                cards: [...item.cards, ...deletedColumn.cards],
              }
              : item
          ),
      };
    });
  }

  function dropCard(targetColId: string, targetCardId?: string) {
    if (!dragging) return;
    setBoard((current) => {
      const source = current.cols.find((col) => col.id === dragging.fromCol);
      const moving = source?.cards.find((card) => card.id === dragging.cardId);
      if (!source || !moving) return current;

      const colsWithoutCard = current.cols.map((col) => ({
        ...col,
        cards: col.cards.filter((card) => card.id !== dragging.cardId),
      }));
      const target = colsWithoutCard.find((col) => col.id === targetColId);
      if (!target) return current;

      const insertionIndex = targetCardId
        ? target.cards.findIndex((card) => card.id === targetCardId)
        : -1;
      const cards = [...target.cards];
      cards.splice(insertionIndex < 0 ? cards.length : insertionIndex, 0, moving);
      return {
        ...current,
        cols: colsWithoutCard.map((col) =>
          col.id === targetColId ? { ...col, cards } : col,
        ),
      };
    });
    setDragging(null);
    setOverColumn(null);
  }

  const sourceCards = board.cols.find((col) => col.locked)?.cards ?? [];

  const boardRef = useRef<HTMLDivElement>(null);

  const isDraggingBoard = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (
      (e.target as HTMLElement).closest(
        "button, input, textarea, select, .task-card"
      )
    ) {
      return;
    }

    const board = boardRef.current;
    if (!board) return;

    isDraggingBoard.current = true;
    startX.current = e.pageX - board.offsetLeft;
    scrollLeft.current = board.scrollLeft;
  }

  function handleBoardMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const board = boardRef.current;

    if (!isDraggingBoard.current || !board) return;

    e.preventDefault();

    const x = e.pageX - board.offsetLeft;
    const distance = (x - startX.current) * 1.2;

    board.scrollLeft = scrollLeft.current - distance;
  }

  function stopDraggingBoard() {
    isDraggingBoard.current = false;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="heading">
          <div className="eyebrow">CONFERENCIA</div>
          <h1>Calendario</h1>
          <p className="subtitle">
            {totalCards} {totalCards === 1 ? "prestador" : "prestadores"} no quadro ·{" "}
            {totalQtd.toLocaleString("pt-BR")} {totalQtd === 1 ? "procedimento" : "procedimentos"} no total
            {importMsg && ` · ${importMsg}`}
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={handleFile}
        />
        <button className="btn" onClick={() => fileInput.current?.click()}>
          <span aria-hidden="true">⇪</span> Importar Excel
        </button>
        <button className="btn" onClick={clearAll} disabled={totalCards === 0}>
          <span aria-hidden="true">🗑</span> Excluir tudo
        </button>
        <button className="btn primary add-column" onClick={addColumn}>
          <span aria-hidden="true">＋</span> Nova data
        </button>

        <button className="btn" onClick={() => setShowTable(true)}>
          <span aria-hidden="true">▤</span> Visualizar tabela
        </button>

        <button className="btn primary" onClick={autoFill}>
          <span aria-hidden="true">⚡</span> Autopreencher
        </button>

        <button className="btn" onClick={() => setShowRules(true)}>
          <span aria-hidden="true">⚙</span> Regras
        </button>
      </header>

      <section
        className="board"
        ref={boardRef}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={stopDraggingBoard}
        onMouseLeave={stopDraggingBoard}
      >
        {board.cols.map((col) => (
          <section
            className={`column ${overColumn === col.id ? "over" : ""}`}
            key={col.id}
            onDragOver={(event) => {
              event.preventDefault();
              setOverColumn(col.id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setOverColumn(null);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const cardElement = (event.target as HTMLElement).closest<HTMLElement>("[data-card-id]");
              dropCard(col.id, cardElement?.dataset.cardId);
            }}
          >
            <div className="column-header">
              <div className="column-heading-info">
                <input
                  className="column-title"
                  aria-label="Nome da coluna"
                  value={col.title}
                  readOnly={col.locked}
                  onChange={(event) => renameColumn(col.id, event.target.value)}
                  onBlur={(event) => renameColumn(col.id, event.target.value)}
                />

                <span className="column-total">
                  {getColumnTotal(col).toLocaleString("pt-BR")} procedimentos
                </span>
              </div>

              <span className="count">{col.cards.length}</span>

              {!col.locked && (
                <button
                  className="icon-button"
                  title="Excluir coluna"
                  aria-label="Excluir coluna"
                  onClick={() => deleteColumn(col)}
                >
                  ×
                </button>
              )}
            </div>

            <div className="cards">
              {col.cards.length === 0 && (
                <div className="empty">
                  {col.locked ? "Importe um Excel para começar" : "Nenhum cartão"}
                </div>
              )}
              {col.cards.map((card) => (
                <article
                  className={`task-card ${dragging?.cardId === card.id ? "dragging" : ""}`}
                  key={card.id}
                  data-card-id={card.id}
                  draggable
                  onDragStart={(event) => {
                    setDragging({ cardId: card.id, fromCol: col.id });
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", card.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverColumn(null);
                  }}
                >
                  <h3>{card.prestador}</h3>
                  <p>
                    <strong>{card.qtd}</strong>{" "}
                    {card.qtd === 1 ? "procedimento" : "procedimentos"}
                  </p>
                </article>
              ))}
            </div>

            {!col.locked && (
              <button className="btn add-card" onClick={() => openDialog(col.id)}>
                <span aria-hidden="true">＋</span> Adicionar prestador
              </button>
            )}
          </section>
        ))}
      </section>

      {editing && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <div className="dialog-heading">
              <div>
                <div className="eyebrow">PRESTADOR</div>
                <h2 id="dialog-title">{editing.cardId ? "Editar cartão" : "Novo cartão"}</h2>
              </div>
              <button className="icon-button close-button" aria-label="Fechar" onClick={closeDialog}>×</button>
            </div>
            <form onSubmit={saveCard}>
              <label>
                Prestador
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={prestador}
                  onChange={(event) => setPrestador(event.target.value)}
                  placeholder="Nome do prestador"
                />
              </label>
              <label>
                Quantidade de procedimentos
                <input
                  type="number"
                  min={0}
                  value={qtd}
                  onChange={(event) => setQtd(event.target.value)}
                />
              </label>
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={closeDialog}>Cancelar</button>
                <button type="submit" className="btn primary">Salvar cartão</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showRules && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowRules(false);
            }
          }}
        >
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            style={{ width: 900, maxHeight: "85vh", overflowY: "auto" }}
          >
            <div className="dialog-heading">
              <div>
                <div className="eyebrow">AUTOPREENCHIMENTO</div>
                <h2>Regras de distribuição</h2>
              </div>

              <button
                className="icon-button"
                onClick={() => setShowRules(false)}
              >
                ×
              </button>
            </div>

            <h3>1. Grupos de prestadores</h3>

            <label>
              Nome do grupo
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Ex.: Grupo de exames"
              />
            </label>

            <div className="rule-provider-container">
              <button
                type="button"
                className="rule-provider-toggle"
                onClick={() => setProviderListOpen((current) => !current)}
              >
                <div>
                  <strong>Selecionar prestadores</strong>
                  <span>
                    {selectedProviders.length} de {sourceCards.length} selecionados
                  </span>
                </div>

                <span className={`rule-provider-arrow ${providerListOpen ? "open" : ""}`}>
                  ▾
                </span>
              </button>

              {providerListOpen && (
                <div className="rule-provider-content">
                  <div className="rule-provider-search">
                    <span>⌕</span>
                    <input
                      type="text"
                      placeholder="Pesquisar prestador..."
                      value={providerSearch}
                      onChange={(e) => setProviderSearch(e.target.value)}
                    />

                    {providerSearch && (
                      <button
                        type="button"
                        onClick={() => setProviderSearch("")}
                        title="Limpar pesquisa"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <div className="rule-provider-list">
                    {[...sourceCards]
                      .filter((card) =>
                        card.prestador
                          .toLowerCase()
                          .includes(providerSearch.trim().toLowerCase())
                      )
                      .sort((a, b) =>
                        a.prestador.localeCompare(b.prestador, "pt-BR")
                      )
                      .map((card) => (
                        <label
                          key={card.id}
                          className={`rule-provider-item ${selectedProviders.includes(card.prestador)
                            ? "selected"
                            : ""
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProviders.includes(card.prestador)}
                            onChange={(e) =>
                              setSelectedProviders((current) =>
                                e.target.checked
                                  ? [...current, card.prestador]
                                  : current.filter(
                                    (name) => name !== card.prestador
                                  )
                              )
                            }
                          />

                          <span>{card.prestador}</span>
                        </label>
                      ))}

                    {sourceCards.filter((card) =>
                      card.prestador
                        .toLowerCase()
                        .includes(providerSearch.trim().toLowerCase())
                    ).length === 0 && (
                        <p className="rule-provider-empty">
                          Nenhum prestador encontrado.
                        </p>
                      )}
                  </div>
                </div>
              )}
            </div>

            <button className="btn primary" onClick={addGroup}>
              + Adicionar grupo
            </button>

            <div className="rules-list">
              {rules.groups.length > 0 && (
                <div className="rules-section-label">
                  <span>Grupos cadastrados</span>
                  <span>{rules.groups.length}</span>
                </div>
              )}

              {rules.groups.map((group) => (
                <div key={group.id} className="rule-card">
                  <div className="rule-card-icon group-icon">♧</div>

                  <div className="rule-card-content">
                    <strong>{group.name}</strong>
                    <span className="rule-card-description">
                      {group.providers.length} prestadores · Sempre juntos
                    </span>
                    <div className="rule-tags">
                      {group.providers.map((provider) => (
                        <span key={provider} className="rule-tag">
                          {provider}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    className="rule-delete"
                    title="Excluir grupo"
                    onClick={() => removeGroup(group.id)}
                  >
                    ×
                  </button>
                </div>
              ))}

              {rules.groups.length === 0 && (
                <p className="rules-empty">
                  Nenhum grupo cadastrado ainda.
                </p>
              )}
            </div>

            <hr />

            <h3>2. Restrições por data</h3>

            <label>
              Prestador
              <select
                value={blockedProvider}
                onChange={(e) => setBlockedProvider(e.target.value)}
              >
                <option value="">Selecione um prestador</option>
                {sourceCards.map((card) => (
                  <option key={card.id} value={card.prestador}>
                    {card.prestador}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Data em que não poderá ser alocado
              <select
                value={blockedColumn}
                onChange={(e) => setBlockedColumn(e.target.value)}
              >
                <option value="">Selecione uma data</option>
                {visibleCols.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </label>

            <button className="btn primary" onClick={addBlockedProvider}>
              + Adicionar restrição
            </button>

            <div className="rules-list">
              {rules.blocked.length > 0 && (
                <div className="rules-section-label">
                  <span>Restrições cadastradas</span>
                  <span>{rules.blocked.length}</span>
                </div>
              )}

              {rules.blocked.map((rule) => {
                const day = visibleCols.find(
                  (col) => col.id === rule.columnId
                );

                return (
                  <div key={rule.id} className="rule-card">
                    <div className="rule-card-icon blocked-icon">⊘</div>

                    <div className="rule-card-content">
                      <strong>{rule.provider}</strong>
                      <span className="rule-card-description">
                        Não poderá ser alocado nesta data
                      </span>
                      <div className="rule-tags">
                        <span className="rule-tag date-tag">
                          {day?.title ?? "Data removida"}
                        </span>
                      </div>
                    </div>

                    <button
                      className="rule-delete"
                      title="Excluir restrição"
                      onClick={() => removeBlocked(rule.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {rules.blocked.length === 0 && (
                <p className="rules-empty">
                  Nenhuma restrição cadastrada ainda.
                </p>
              )}
            </div>

            <div className="dialog-actions">
              <button
                className="btn primary"
                onClick={() => setShowRules(false)}
              >
                Salvar regras
              </button>
            </div>
          </section>
        </div>
      )}

      {showTable && (
        <div
          className="table-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowTable(false);
            }
          }}
        >
          <section
            className="table-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="table-modal-title"
          >
            <div className="table-modal-header">
              <div>
                <div className="eyebrow">CONFERÊNCIA</div>
                <h2 id="table-modal-title">Calendário de entregas</h2>
              </div>

              <button
                className="icon-button"
                aria-label="Fechar tabela"
                onClick={() => setShowTable(false)}
              >
                ×
              </button>

              <button className="btn" onClick={downloadTable}>
                <span aria-hidden="true">↓</span>
                Baixar Excel
              </button>
            </div>

            <div className="table-modal-content">
              <table className="data-table">
                <thead>
                  <tr>
                    {visibleCols.map((col) => (
                      <th key={col.id} colSpan={3}>{col.title}</th>
                    ))}
                  </tr>
                  <tr>
                    {visibleCols.map((col) => (
                      <React.Fragment key={col.id}>
                        <th>PRESTADOR</th>
                        <th>PROCEDIMENTOS</th>
                        <th>HORA</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {Array.from({
                    length: Math.max(1, ...visibleCols.map((col) => col.cards.length)),
                  }).map((_, rowIndex) => (
                    <tr key={rowIndex}>
                      {visibleCols.map((col) => {
                        const card = col.cards[rowIndex];
                        const cellKey = `${col.id}:${rowIndex}`;
                        const over = overCell === cellKey ? "drop-target" : "";
                        const dropProps = {
                          onDragOver: (event: React.DragEvent) => {
                            event.preventDefault();
                            setOverCell(cellKey);
                          },
                          onDrop: (event: React.DragEvent) => {
                            event.preventDefault();
                            dropCard(col.id, card?.id);
                            setOverCell(null);
                          },
                        };

                        return (
                          <React.Fragment key={col.id}>
                            <td
                              className={`${card ? "drag-cell" : ""} ${over} ${card && dragging?.cardId === card.id ? "dragging-cell" : ""
                                }`}
                              draggable={!!card}
                              onDragStart={(event) => {
                                if (!card) return;
                                setDragging({ cardId: card.id, fromCol: col.id });
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", card.id);
                              }}
                              onDragEnd={() => {
                                setDragging(null);
                                setOverCell(null);
                              }}
                              {...dropProps}
                            >
                              {card?.prestador ?? ""}
                            </td>
                            <td className={`table-number ${over}`} {...dropProps}>
                              {card ? card.qtd.toLocaleString("pt-BR") : ""}
                            </td>
                            <td className={`table-number ${over}`} {...dropProps}>
                              {card && (
                                <input
                                  type="time"
                                  className="hora-input"
                                  aria-label="Hora"
                                  value={card.hora ?? ""}
                                  onChange={(event) =>
                                    updateHora(col.id, card.id, event.target.value)
                                  }
                                />
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}

                  <tr className="table-total-row">
                    {visibleCols.map((col) => (
                      <React.Fragment key={col.id}>
                        <td>TOTAL</td>
                        <td className="table-number">
                          {getColumnTotal(col).toLocaleString("pt-BR")}
                        </td>
                        <td />
                      </React.Fragment>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="table-modal-footer">
              <span>
                {totalCards} prestadores · {totalQtd.toLocaleString("pt-BR")} procedimentos
              </span>

              <button
                className="btn"
                onClick={() => setShowTable(false)}
              >
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}