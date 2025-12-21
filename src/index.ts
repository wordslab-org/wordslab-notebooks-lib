import '../style/index.css';
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { INotebookCellExecutor, runCell } from '@jupyterlab/notebook';
import { Cell } from '@jupyterlab/cells';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-lib:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, 
             notebookTracker: INotebookTracker, 
             settingRegistry: ISettingRegistry | null) => {
                 
    console.log('Wordslab notebooks extension activated');
          
    // -------------------------------------
    // 1. Introduce a new "prompt" cell type
    // -------------------------------------
      
    // Apply cells styles to visualize their type
    function applyCellStyle(cell: Cell) {
        let cellType = cell.model.getMetadata('wordslab_cell_type');
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

    // Test if the currently active cell is a prompt cell
    /*function isPromptCell(notebookTracker: INotebookTracker): boolean {
      const notebook = notebookTracker.currentWidget?.content;
      const cell = notebook?.activeCell;
      return cell?.model.getMetadata('wordslab_cell_type') === 'prompt';
    }*/
      
    // -----------------
    // Debug utilties
    // -----------------
      
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

const cellExecutorPlugin: JupyterFrontEndPlugin<INotebookCellExecutor> = {
  id: 'wordslab-notebooks-lib:cell-executor',
  description: 'Custom Jupyterlab cell executor for wordslab-notebooks',
  autoStart: true,
  provides: INotebookCellExecutor,
  activate: (): INotebookCellExecutor => {
    console.log('Wordslab notebooks cell executor activated');

    // ----------------------------------------------
    // 2. Customize the "prompt" cell execution logic
    // ----------------------------------------------

    // Define a custom cell executor
    class WordslabCellExecutor implements INotebookCellExecutor {
      runCell(options: INotebookCellExecutor.IRunCellOptions): Promise<boolean> {

        // Prompt cell
        const cellType = options.cell.model.getMetadata('wordslab_cell_type');        
        if (cellType === 'prompt') {
          console.log('Prompt cell intercepted!');
          // TODO: custom execution
          return Promise.resolve(true);
        }

        // Other cells
        return runCell(options);
      }
    }
          
    return new WordslabCellExecutor();
  }
};

export default [cellExecutorPlugin, plugin];
