import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { AZORES_BOX, MADEIRA_BOX, PROJECTIONS, Projection, REGIONS, VIEW_H, VIEW_W } from "./mapData";

const SVG_NS = "http://www.w3.org/2000/svg";
const ISLAND_IDS = new Set(["PT-20", "PT-30"]);

interface Place {
    id: string;
    name: string;
    x: number;
    y: number;
}

/** Projects a coordinate onto the map, sending Azores and Madeira points into their inset boxes. */
function project(lat: number, lon: number): [number, number] {
    const p: Projection = lon < -20 ? PROJECTIONS.azores : lat < 34 ? PROJECTIONS.madeira : PROJECTIONS.main;
    return [p.x0 + (lon - p.lon0) * p.kx, p.y0 + (p.lat0 - lat) * p.ky];
}

/** Reads a field case-insensitively from one of several candidate names. */
function pick(row: Record<string, unknown>, names: string[]): unknown {
    const keys = Object.keys(row);
    for (const name of names) {
        const key = keys.find((k) => k.toLowerCase() === name);
        if (key !== undefined && row[key] !== null && row[key] !== undefined) return row[key];
    }
    return undefined;
}

function parsePlaces(json: string | null): Place[] {
    if (!json) return [];
    let rows: unknown;
    try {
        rows = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(rows)) return [];
    const places: Place[] = [];
    for (const row of rows) {
        if (typeof row !== "object" || row === null) continue;
        const r = row as Record<string, unknown>;
        const lat = Number(pick(r, ["latitude", "lat"]));
        const lon = Number(pick(r, ["longitude", "lon", "lng"]));
        const id = pick(r, ["id"]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || id === undefined) continue;
        const [x, y] = project(lat, lon);
        places.push({ id: String(id), name: String(pick(r, ["name", "nome"]) ?? id), x, y });
    }
    return places;
}

/** Mixes a hex colour with white; amount 0 keeps the colour, 1 gives white. */
function tint(hex: string, amount: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return "#FFD9C2";
    const n = parseInt(m[1], 16);
    const mix = (c: number) => Math.round(c + (255 - c) * amount);
    return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
}

export class PortugalMap implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private root!: HTMLDivElement;
    private svg!: SVGSVGElement;
    private labelLayer!: SVGGElement;
    private pinLayer!: SVGGElement;
    private tooltip!: HTMLDivElement;
    private notifyOutputChanged!: () => void;

    private readonly regionEls = new Map<string, SVGPathElement>();
    private readonly insetEls = new Map<string, SVGRectElement>();
    private readonly labelEls = new Map<string, SVGTextElement>();
    private readonly pinEls = new Map<string, SVGGElement>();
    private readonly selected = new Set<string>();
    private places: Place[] = [];
    private placesJson: string | null = null;
    private lastSelectedInput: string | null = null;
    private emittedSelected = "";
    private hovered: { id: string; name: string } | null = null;
    private selectRegions = true;
    private multiSelect = true;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this.notifyOutputChanged = notifyOutputChanged;
        context.mode.trackContainerResize(true);

        this.root = document.createElement("div");
        this.root.className = "pm-root";
        container.appendChild(this.root);

        this.svg = el("svg", { viewBox: `0 0 ${VIEW_W} ${VIEW_H}`, class: "pm-svg", role: "group", "aria-label": "Mapa de Portugal" });
        this.root.appendChild(this.svg);

        // The islands are tiny, so the whole inset box hovers and selects its region too.
        for (const [box, title, id, name] of [[AZORES_BOX, "AÇORES", "PT-20", "Açores"], [MADEIRA_BOX, "MADEIRA", "PT-30", "Madeira"]] as const) {
            const rect = el("rect", { x: box[0], y: box[1], width: box[2], height: box[3], rx: 10, class: "pm-inset", "data-id": id });
            this.wireInteractive(rect, id, name, true);
            this.svg.appendChild(rect);
            this.insetEls.set(id, rect);
            const t = el("text", { x: box[0] + 10, y: box[1] + 13, class: "pm-inset-title" });
            t.textContent = title;
            this.svg.appendChild(t);
        }

        const regionLayer = el("g", { class: "pm-regions" });
        this.svg.appendChild(regionLayer);
        for (const r of REGIONS) {
            const path = el("path", {
                d: r.path,
                class: ISLAND_IDS.has(r.id) ? "pm-region pm-island" : "pm-region",
                tabindex: 0,
                role: "button",
                "aria-label": r.name,
                "data-id": r.id,
            });
            this.wireInteractive(path, r.id, r.name, true);
            regionLayer.appendChild(path);
            this.regionEls.set(r.id, path);
        }

        this.labelLayer = el("g", { class: "pm-labels", "aria-hidden": "true" });
        this.svg.appendChild(this.labelLayer);
        for (const r of REGIONS) {
            if (ISLAND_IDS.has(r.id)) continue;
            const t = el("text", { x: r.lx, y: r.ly, class: "pm-label" });
            t.textContent = r.name;
            this.labelLayer.appendChild(t);
            this.labelEls.set(r.id, t);
        }

        this.pinLayer = el("g", { class: "pm-pins" });
        this.svg.appendChild(this.pinLayer);

        this.tooltip = document.createElement("div");
        this.tooltip.className = "pm-tooltip";
        this.root.appendChild(this.tooltip);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const p = context.parameters;
        this.selectRegions = p.selectRegions.raw !== false;
        this.multiSelect = p.multiSelect.raw !== false;
        this.root.classList.toggle("pm-no-region-select", !this.selectRegions);
        this.labelLayer.style.display = p.showLabels.raw === false ? "none" : "";

        const accent = p.accentColor.raw || "#FF5F00";
        this.root.style.setProperty("--pm-accent", accent);
        this.root.style.setProperty("--pm-hover", tint(accent, 0.7));

        const w = context.mode.allocatedWidth;
        const h = context.mode.allocatedHeight;
        this.root.style.width = w > 0 ? `${w}px` : "100%";
        this.root.style.height = h > 0 ? `${h}px` : "100%";

        const placesJson = p.placesJson.raw;
        if (placesJson !== this.placesJson) {
            this.placesJson = placesJson;
            this.places = parsePlaces(placesJson);
            this.renderPins();
        }

        // Only take the bound value when the app changed it, not when it echoes our own output back.
        const selectedInput = p.selectedIds.raw ?? "";
        if (selectedInput !== this.lastSelectedInput) {
            this.lastSelectedInput = selectedInput;
            if (selectedInput !== this.emittedSelected) {
                this.selected.clear();
                for (const id of selectedInput.split("|")) if (id.trim()) this.selected.add(id.trim());
                this.emittedSelected = this.serialize();
            }
        }
        this.refreshSelection();
    }

    public getOutputs(): IOutputs {
        const names: string[] = [];
        for (const r of REGIONS) if (this.selected.has(r.id)) names.push(r.name);
        for (const pl of this.places) if (this.selected.has(pl.id)) names.push(pl.name);
        return {
            selectedIds: this.emittedSelected,
            hoveredId: this.hovered?.id ?? "",
            hoveredName: this.hovered?.name ?? "",
            selectedNames: names.join(", "),
            selectedCount: names.length,
        };
    }

    public destroy(): void {
        this.root.remove();
    }

    private serialize(): string {
        return Array.from(this.selected).join("|");
    }

    private wireInteractive(node: SVGElement, id: string, name: string, isRegion: boolean): void {
        const enabled = () => !isRegion || this.selectRegions;
        node.addEventListener("mouseenter", () => {
            this.setHovered({ id, name });
        });
        node.addEventListener("mousemove", (e) => this.moveTooltip(e as MouseEvent, name));
        node.addEventListener("mouseleave", () => {
            this.setHovered(null);
            this.tooltip.classList.remove("pm-visible");
        });
        node.addEventListener("click", () => {
            if (enabled()) this.toggle(id);
        });
        node.addEventListener("keydown", (e) => {
            const key = (e as KeyboardEvent).key;
            if ((key === "Enter" || key === " ") && enabled()) {
                e.preventDefault();
                this.toggle(id);
            }
        });
        node.addEventListener("focus", () => this.setHovered({ id, name }));
        node.addEventListener("blur", () => this.setHovered(null));
    }

    private setHovered(value: { id: string; name: string } | null): void {
        if ((value?.id ?? "") === (this.hovered?.id ?? "")) return;
        if (this.hovered) this.hoverTargets(this.hovered.id).forEach((n) => n.classList.remove("pm-hovered"));
        this.hovered = value;
        if (value) this.hoverTargets(value.id).forEach((n) => n.classList.add("pm-hovered"));
        this.notifyOutputChanged();
    }

    private hoverTargets(id: string): Element[] {
        const isRegion = this.regionEls.has(id);
        if (isRegion && !this.selectRegions) return [];
        return [this.regionEls.get(id), this.insetEls.get(id), this.pinEls.get(id)].filter((n): n is NonNullable<typeof n> => n !== undefined);
    }

    private moveTooltip(e: MouseEvent, name: string): void {
        const box = this.root.getBoundingClientRect();
        this.tooltip.textContent = this.selected.has(this.hovered?.id ?? "") ? `${name} ✓` : name;
        this.tooltip.style.left = `${e.clientX - box.left + 12}px`;
        this.tooltip.style.top = `${e.clientY - box.top + 14}px`;
        this.tooltip.classList.add("pm-visible");
    }

    private toggle(id: string): void {
        if (this.selected.has(id)) {
            this.selected.delete(id);
        } else {
            if (!this.multiSelect) this.selected.clear();
            this.selected.add(id);
        }
        this.emittedSelected = this.serialize();
        this.refreshSelection();
        this.notifyOutputChanged();
    }

    private renderPins(): void {
        this.pinLayer.replaceChildren();
        this.pinEls.clear();
        for (const pl of this.places) {
            const g = el("g", { class: "pm-pin", tabindex: 0, role: "button", "aria-label": pl.name, transform: `translate(${pl.x.toFixed(1)} ${pl.y.toFixed(1)})` });
            g.appendChild(el("circle", { r: 10, class: "pm-pin-hit" }));
            g.appendChild(el("circle", { r: 4.5, class: "pm-pin-dot" }));
            const left = pl.x > 330 || pl.x < AZORES_BOX[0] + AZORES_BOX[2] && pl.y < AZORES_BOX[1] + AZORES_BOX[3];
            const t = el("text", { x: left ? -9 : 9, y: 3, "text-anchor": left ? "end" : "start", class: "pm-pin-label" });
            t.textContent = pl.name;
            g.appendChild(t);
            this.wireInteractive(g, pl.id, pl.name, false);
            this.pinLayer.appendChild(g);
            this.pinEls.set(pl.id, g);
        }
    }

    private refreshSelection(): void {
        for (const [id, path] of this.regionEls) {
            const on = this.selected.has(id);
            path.classList.toggle("pm-selected", on);
            path.setAttribute("aria-pressed", String(on));
        }
        for (const [id, t] of this.labelEls) t.classList.toggle("pm-selected", this.selected.has(id));
        for (const [id, g] of this.pinEls) {
            const on = this.selected.has(id);
            g.classList.toggle("pm-selected", on);
            g.setAttribute("aria-pressed", String(on));
        }
    }
}
