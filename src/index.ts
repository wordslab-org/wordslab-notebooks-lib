import '../style/index.css';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { INotebookTracker } from '@jupyterlab/notebook';
import { Cell } from '@jupyterlab/cells';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-lib:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker, settingRegistry: ISettingRegistry | null) => {
    console.log('Wordslab notebooks extension activated');
      
    // Special execution for prompt cells    
    async function executePromptCell() {
      console.log('Execute prompt');
      // TODO: call nbchat() instead
    }
      
    // Wrap the run-cell command with our own logic
    function isPromptCell(notebookTracker: INotebookTracker): boolean {
      const notebook = notebookTracker.currentWidget?.content;
      const cell = notebook?.activeCell;
      return cell?.model.getMetadata('wordslab_cell_type') === 'prompt';
    }    
    app.commands.addCommand('wordslab:run-cell', {
      label: 'Run Cell',
      execute: async (args: any) => {
        if (isPromptCell(notebookTracker)) {
          await executePromptCell();
        } else {
          return app.commands.execute('notebook:run-cell', args);
        }
      }
    });    
    app.commands.addCommand('wordslab:run-cell-and-select-next', {
      label: 'Run Cell and Select Next',
      execute: async (args: any) => {
        if (isPromptCell(notebookTracker)) {
          await executePromptCell();
          app.commands.execute('notebook:move-cursor-down');
        } else {
          return app.commands.execute('notebook:run-cell-and-select-next', args);
        }
      }
    });    
    app.commands.addCommand('wordslab:run-cell-and-insert-below', {
      label: 'Run Cell and Insert Below',
      execute: async (args: any) => {
        if (isPromptCell(notebookTracker)) {
          await executePromptCell();
          app.commands.execute('notebook:insert-cell-below');
        } else {
          return app.commands.execute('notebook:run-cell-and-insert-below', args);
        }
      }
    });
    app.commands.addKeyBinding({
      command: 'wordslab:run-cell',
      keys: ['Ctrl Enter'],
      selector: '.jp-Notebook-cell.jp-mod-active'
    });    
    app.commands.addKeyBinding({
      command: 'wordslab:run-cell-and-select-next',
      keys: ['Shift Enter'],
      selector: '.jp-Notebook-cell.jp-mod-active'
    });    
    app.commands.addKeyBinding({
      command: 'wordslab:run-cell-and-insert-below',
      keys: ['Alt Enter'],
      selector: '.jp-Notebook-cell.jp-mod-active'
    });
      
    // Apply cells styles to visualize their type
    function applyCellStyle(cell: Cell) {
        var cellType = cell.model.getMetadata('wordslab_cell_type');
        if (cellType == null) {
          cellType = cell.model.type;
        }
          
        cell.node.classList.remove('cell-type-note', 'cell-type-code', 'cell-type-prompt');            
        if (cellType === 'prompt') {
          cell.node.classList.add('cell-type-prompt');
          if (cell.editor) {
            cell.editor.model.mimeType = 'text/x-markdown';
          }
        } else if (cellType === 'markdown') {
          cell.node.classList.add('cell-type-note');
          if (cell.editor) {
            cell.editor.model.mimeType = 'text/x-markdown';
          }
        } else if (cellType === 'code') {
          cell.node.classList.add('cell-type-code');
          if (cell.editor) {
            cell.editor.model.mimeType = 'text/x-ipython';
          }
        }
    }

    // Apply cells styles when ...
    notebookTracker.widgetAdded.connect((_, notebookPanel) => {
      notebookPanel.context.ready.then(() => {
          const notebook = notebookPanel.content;

          // ... a notebook is loaded
          notebook.widgets.forEach(cell => {
            applyCellStyle(cell);

            // The issue is that when context.ready fires, the cell widgets might not be fully initialized yet
            // Need to reapply the mimeType for prompt cells after the editor is initialized
            const cellType = cell.model.getMetadata('wordslab_cell_type');
            if (cellType === 'prompt' && cell.editor) {
              cell.editor.model.mimeType = 'text/x-markdown';
            }
          });

          // ... a new cell is created or its style is changed
          notebook.model!.cells.changed.connect((_, args) => {   
              args.newValues.forEach(cellModel => {
                const cellWidget = notebook.widgets.find(c => c.model.id === cellModel.id);
                if (cellWidget) {
                  applyCellStyle(cellWidget);
                }
              });
            });
      });
    });
      
    // Register a set-note command which changes the cell type to markdown
    app.commands.addCommand('wordslab:set-note', {
      label: 'note',
      execute: async () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          await app.commands.execute('notebook:change-cell-to-markdown');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.deleteMetadata('wordslab_cell_type');
            applyCellStyle(cell);
          }
        }
      }
    });

    // Register a set-code command which changes the cell type to code
    app.commands.addCommand('wordslab:set-code', {
      label: 'code',
      execute: async () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          await app.commands.execute('notebook:change-cell-to-code');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.deleteMetadata('wordslab_cell_type');
            applyCellStyle(cell);
          }
        }
      }
    });

    // Register a set-prompt command which changes the cell type to prompt
    app.commands.addCommand('wordslab:set-prompt', {
      label: 'prompt',
      execute: async () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          await app.commands.execute('notebook:change-cell-to-code');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.setMetadata('wordslab_cell_type', 'prompt');
            applyCellStyle(cell);
          }
        }
      }
    });
      
    // Print cell id and type when a new cell gets the focus
    if (app.shell.currentChanged) {
        app.shell.currentChanged.connect(() => {
          const widget = app.shell.currentWidget;
          if (widget && widget instanceof NotebookPanel) {
            const notebook = widget.content;
            notebook.activeCellChanged.connect((_, cell) => {
              if (cell) {                  
                // Debug log
                const cellType = cell.model.getMetadata('wordslab_cell_type');
                console.log('Cell focused:', cell.model.id, 'type:', cellType || cell.model.type);
              }
            });
          }
        });
    }      
  }
};

export default plugin;
