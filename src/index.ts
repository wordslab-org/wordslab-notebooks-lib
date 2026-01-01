import '../style/index.css';
import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { INotebookCellExecutor, runCell } from '@jupyterlab/notebook';
import { Cell, CodeCell } from '@jupyterlab/cells';
import { circleEmptyIcon } from '@jupyterlab/ui-components';

const version = "0.0.13";

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-lib:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, 
             notebookTracker: INotebookTracker, 
             settingRegistry: ISettingRegistry | null) => {
                 
    console.log(`Wordslab notebooks extension v${version} activated`);
                 
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
            cell.editor.model.mimeType = 'text/plain';
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
        
        const isHidden = cell.model.getMetadata('wordslab_hide_from_ai');
        if(isHidden) {
          cell.node.classList.add('cell-hidden-from-ai');
        } else {
          cell.node.classList.remove('cell-hidden-from-ai');
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
              cell.editor.model.mimeType = 'text/plain';
            }
          });

          // ... a new cell is created or its type is changed
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

    // Register a toggle-hide-from-ai to exclude select cells from the prompt context
    app.commands.addCommand('wordslab:toggle-hide-from-ai', {
      label: "Hide from AI",
      icon: circleEmptyIcon,
      execute: () => {
        const cell = notebookTracker.currentWidget?.content.activeCell;
        if (cell) {
          const isHidden = cell.model.getMetadata('wordslab_hide_from_ai');
          if (isHidden) {
            cell.model.deleteMetadata('wordslab_hide_from_ai');
            applyCellStyle(cell);
          } else {
            cell.model.setMetadata('wordslab_hide_from_ai', true);
            applyCellStyle(cell);
          }
        }
      }
    });
                 
    // ----------------------------------------------
    // 2. Customize the "prompt" cell execution logic
    // ----------------------------------------------
                 
    // The specific execution for a prompt cell is implemented via the "cellExecutorPlugin", see below

    // -----------------------------------
    // 3. Create, update, delete and run cells
    // -----------------------------------
                 
    function getInsertIndex(notebookPanel: NotebookPanel, placement: string, cellId: string): number {
      const cells = notebookPanel.model?.sharedModel.cells;
      if (!cells) return 0;
    
      if (placement === 'at_start') return 0;
      if (placement === 'at_end') return cells.length;
    
      const refIndex = cells.findIndex((c: any) => c.id === cellId);
      if (refIndex === -1) return -1;
    
      if (placement === 'add_before') return refIndex;
      if (placement === 'add_after') return refIndex + 1;
    
      return cells.length;
    }
                 
    // Register a comm target whenever a kernel becomes available.
    notebookTracker.widgetAdded.connect((_, notebookPanel) => {
      const session = notebookPanel.sessionContext;
    console.log(notebookPanel.context.path);
      session.kernelChanged.connect((_, args) => {
        const kernel = args.newValue;
        if (kernel) {            
          kernel.registerCommTarget('wordslab_notebooks', (comm, openMsg) => {           
            comm.onMsg = (msg: any) => {
              const data = msg.content.data;

              // -- Select the target notebook --
              let targetNotebookPanel: NotebookPanel | undefined = notebookPanel;
              if(data.notebook_path) {
                targetNotebookPanel = notebookTracker.find(panel => panel.context.path === data.notebook_path);
                if (!targetNotebookPanel) {
                  comm.send({ success: false, error: `Notebook not found: ${data.notebook_path}. Make sure the notebook is opened in Jupyterlab.` });
                  return;
                }
              }                
                
              // -- Add a new cell --  
              if (data.action === 'create_cell' && targetNotebookPanel) {
                const insertIndex = getInsertIndex(targetNotebookPanel, data.placement, data.cell_id);
                if (insertIndex === -1) {
                  comm.send({ success: false, error: `Cell not found: ${data.cell_id}` } );
                  return;
                }
                let cellModel: any;
                if(data.cell_type === 'prompt') 
                {
                    cellModel = { cell_type: 'code', source: data.content, metadata: { wordslab_cell_type: 'prompt' } };
                } 
                else if(data.cell_type === 'code') 
                {
                    cellModel = cellModel = { cell_type: 'code', source: data.content };
                } 
                else 
                {
                    cellModel = cellModel = { cell_type: 'markdown', source: data.content };
                }
                const newCell = targetNotebookPanel.model?.sharedModel.insertCell(insertIndex, cellModel);
                comm.send({ success: true, cell_id: newCell?.id, cell_index: insertIndex } as any);
                return;
              }
              
              // -- Select the target cell -
              let cell;
              let cellIndex;
              if(data.cell_id) {
                const cells = targetNotebookPanel.model?.sharedModel.cells;
                cellIndex = cells?.findIndex((c: any) => c.id === data.cell_id);
                if (!cells || cellIndex === undefined || cellIndex === -1) {
                  comm.send({ success: false, error: `Cell not found: ${data.cell_id}` } );
                  return;
                }
                cell = cells[cellIndex];
              }
              if(cell!=null && cellIndex!=null)
              {
              // -- Update an existing cell --
              if (data.action === 'update_cell' && targetNotebookPanel && cell) {
                if(data.content)
                {
                  cell.setSource(data.content);
                }
                comm.send({ success: true, cell_id: data.cell_id, cell_index: cellIndex });
                return;
              }

              // -- Delete an existing cell --
              if (data.action === 'delete_cell' && targetNotebookPanel) {  
                targetNotebookPanel.model?.sharedModel.deleteCell(cellIndex);
                comm.send({ success: true, cell_id: data.cell_id, cell_index: cellIndex });
                return;
              }

              // -- Run an existing cell --
              if (data.action === 'run_cell' && targetNotebookPanel) {
                // Save the current state before switching
                const currentActiveCellIndex = targetNotebookPanel.content.activeCellIndex;
                // Activate the target, run the cell
                targetNotebookPanel.content.activeCellIndex = cellIndex;
                app.commands.execute('notebook:run-cell'); 
                // Switch back
                if (currentActiveCellIndex !== undefined) {
                  targetNotebookPanel.content.activeCellIndex = currentActiveCellIndex;
                }
                // Send success
                comm.send({ success: true, cell_id: data.cell_id, cell_index: cellIndex });
                return;
              }
              }
            };
          });
        }
      });
    });
                 
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
    console.log(`Wordslab notebooks cell executor v${version} activated`);

    // ----------------------------------------------
    // 2. Customize the "prompt" cell execution logic
    // ----------------------------------------------

    // Define a custom cell executor
    class WordslabCellExecutor implements INotebookCellExecutor {
        
        private async injectVariable(kernel: any, name: string, value: any): Promise<void> {
          const code = `import json; ${name} = json.loads(${JSON.stringify(JSON.stringify(value))})`;
          await kernel.requestExecute({ code, store_history: false }).done;
        }
        
      async runCell(options: INotebookCellExecutor.IRunCellOptions): Promise<boolean> {
          
        let cellType = options.cell.model.getMetadata('wordslab_cell_type');
        if (cellType == null) {
          cellType = options.cell.model.type;
        }
          
        // Code or Prompt cell => inject variables in the python kernel describing the notebook context 
        if (cellType === 'code' || cellType === 'prompt') {
              const kernel = options.sessionContext?.session?.kernel;
              if (kernel) {
                await this.injectVariable(kernel, '__wordslab_extension_version', version);
                const notebookPath = options.sessionContext?.path || '';
                await this.injectVariable(kernel, '__notebook_path', notebookPath);
                const notebookContent = options.notebook.toJSON();            
                await this.injectVariable(kernel, '__notebook_content', notebookContent);
                const cellId = options.cell.model.id;
                await this.injectVariable(kernel, '__cell_id', cellId);
                 
                // Prompt cell => use the text of the cell as a prompt and send it to notebook.chat   
                if (cellType === 'prompt') {
                  const cell = options.cell as CodeCell;
                  const outputArea = cell.outputArea;
                  if(outputArea.model.length == 0)
                  {
                    const notebook_import_code = `
if not (("notebook" in globals()) and ("WordslabNotebook" in str(type(notebook)))): 
    try: from wordslab_notebooks_lib.notebook import WordslabNotebook; notebook = WordslabNotebook()
    except Exception: print("Error: you need to install 'wordslab-notebooks-lib' before you can execute prompt cells")
`;
                    await kernel.requestExecute({ code: notebook_import_code, store_history: false }).done;
                    
                    const promptText = options.cell.model.sharedModel.source;
                    const notebook_chat_code = `notebook.chat(${JSON.stringify(promptText)})`;
                    const future = kernel.requestExecute({ code: notebook_chat_code, store_history: true });          
                  // This line is critical to wire display() calls   
                    outputArea.future = future;
                    await future.done;
                  }
                  return Promise.resolve(true);
                }
              }
        }

        // Other cells
        return runCell(options);
      }
    }
          
    return new WordslabCellExecutor();
  }
};

export default [cellExecutorPlugin, plugin];
