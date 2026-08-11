import { SYMBOLS } from './session.js';

export class PuzzleUI {
  constructor(container, { puzzle, values, onChange, readonly = false, statuses = null }) {
    this.container = container;
    this.puzzle = puzzle;
    this.values = values;
    this.onChange = onChange;
    this.readonly = readonly;
    this.statuses = statuses;
    this.active = this.firstEditable();
    this.hintIndex = null;
    this.keyHandler = (event) => this.handleKey(event);
    this.render();
    document.addEventListener('keydown', this.keyHandler);
  }

  firstEditable() {
    const index = this.puzzle.grid.flat().findIndex((value) => !value);
    return index === -1 ? 0 : index;
  }

  destroy() {
    document.removeEventListener('keydown', this.keyHandler);
  }

  render() {
    this.container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'latin-grid';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Five by five Latin square');

    for (let index = 0; index < 25; index += 1) {
      const row = Math.floor(index / 5);
      const column = index % 5;
      const given = Boolean(this.puzzle.grid[row][column]);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(index);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1}${given ? ', given' : ''}`);
      cell.textContent = this.values[row][column] || '';
      if (given) cell.classList.add('given');
      if (this.statuses?.[row]?.[column]) cell.classList.add(this.statuses[row][column]);
      if (!this.readonly && !given) cell.addEventListener('click', () => this.select(index));
      if (this.readonly || given) cell.tabIndex = -1;
      grid.append(cell);
    }
    this.container.append(grid);
    this.updateHighlights();
  }

  select(index) {
    if (this.readonly) return;
    const row = Math.floor(index / 5);
    const column = index % 5;
    if (this.puzzle.grid[row][column]) return;
    this.active = index;
    this.updateHighlights();
  }

  updateHighlights() {
    const activeRow = Math.floor(this.active / 5);
    const activeColumn = this.active % 5;
    this.container.querySelectorAll('.cell').forEach((cell, index) => {
      const row = Math.floor(index / 5);
      const column = index % 5;
      cell.classList.toggle('active', !this.readonly && index === this.active);
      cell.classList.toggle('peer', !this.readonly && index !== this.active && (row === activeRow || column === activeColumn));
      cell.classList.toggle('hint-cell', index === this.hintIndex);
    });
  }

  enter(value) {
    if (this.readonly || !SYMBOLS.includes(value)) return;
    const row = Math.floor(this.active / 5);
    const column = this.active % 5;
    if (this.puzzle.grid[row][column]) return;
    this.values[row][column] = value;
    this.container.querySelector(`[data-index="${this.active}"]`).textContent = value;
    this.onChange?.(this.values);
    this.move(1);
  }

  clear() {
    if (this.readonly) return;
    const row = Math.floor(this.active / 5);
    const column = this.active % 5;
    if (this.puzzle.grid[row][column]) return;
    this.values[row][column] = '';
    this.container.querySelector(`[data-index="${this.active}"]`).textContent = '';
    this.onChange?.(this.values);
  }

  move(offset) {
    for (let step = 1; step <= 25; step += 1) {
      const index = (this.active + offset * step + 25 * 4) % 25;
      const row = Math.floor(index / 5);
      const column = index % 5;
      if (!this.puzzle.grid[row][column]) {
        this.active = index;
        this.updateHighlights();
        return;
      }
    }
  }

  handleKey(event) {
    if (this.readonly) return;
    const key = event.key.toUpperCase();
    if (SYMBOLS.includes(key)) {
      event.preventDefault();
      this.enter(key);
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      this.clear();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
      this.move(offsets[event.key]);
    }
  }

  showHint(row, column) {
    this.hintIndex = row * 5 + column;
    this.select(this.hintIndex);
    this.updateHighlights();
  }
}
