import '../style/index.css';
import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { INotebookTracker } from '@jupyterlab/notebook';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-lib:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker, settingRegistry: ISettingRegistry | null) => {
    console.log('Wordslab notebooks extension activated');

    const originalRunCell = app.commands.hasCommand('notebook:run-cell');
    console.log('Run cell command exists:', originalRunCell);
      
    // Apply cells type styles when a notebook is opened
    notebookTracker.widgetAdded.connect((_, notebookPanel) => {
      notebookPanel.context.ready.then(() => {
          const notebook = notebookPanel.content;
          notebook.widgets.forEach(cell => {
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
            } else if (cellType === 'code') {
              cell.node.classList.add('cell-type-code');
            }
          });
      });
    });
      
    // Register a set-note command which changes the cell type to markdown
    app.commands.addCommand('wordslab:set-note', {
      label: 'note',
      execute: () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          app.commands.execute('notebook:change-cell-to-markdown');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.deleteMetadata('wordslab_cell_type');
            cell.node.classList.remove('cell-type-code', 'cell-type-prompt');
            cell.node.classList.add('cell-type-note');
            if (cell.editor) {
              cell.editor.model.mimeType = 'text/x-markdown';
            }
          }
        }
      }
    });

    // Register a set-code command which changes the cell type to code
    app.commands.addCommand('wordslab:set-code', {
      label: 'code',
      execute: () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          app.commands.execute('notebook:change-cell-to-code');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.deleteMetadata('wordslab_cell_type');
            cell.node.classList.remove('cell-type-note', 'cell-type-prompt');
            cell.node.classList.add('cell-type-code');
            if (cell.editor) {
              cell.editor.model.mimeType = 'text/x-python';
            }
          }
        }
      }
    });

    // Register a set-prompt command which changes the cell type to prompt
    app.commands.addCommand('wordslab:set-prompt', {
      label: 'prompt',
      execute: () => {
        const notebook = notebookTracker.currentWidget?.content;
        if (notebook) {
          app.commands.execute('notebook:change-cell-to-code');
          const cell = notebook.activeCell;
          if (cell) {
            cell.model.setMetadata('wordslab_cell_type', 'prompt');
            cell.node.classList.remove('cell-type-note', 'cell-type-code');
            cell.node.classList.add('cell-type-prompt');
            if (cell.editor) {
              cell.editor.model.mimeType = 'text/x-markdown';
            }
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
