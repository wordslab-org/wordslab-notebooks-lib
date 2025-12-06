import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { INotebookTracker, NotebookActions, NotebookPanel } from '@jupyterlab/notebook';
import { ICodeCellModel } from '@jupyterlab/cells';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-extension:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker) => {
    console.log('Wordslab notebooks extension activated');

    // ---------
    // Track executing cells in all notebooks

    const executingCells = new Map<string, string[]>(); // notebook path -> array of cell IDs
    
    NotebookActions.executionScheduled.connect((sender, args) => {
      const { notebook, cell } = args;
      
      const panel = notebookTracker.find(panel => panel?.content === notebook);
      if (!panel) return;
      
      const notebookPath = panel.sessionContext.path;
      const cellId = cell.model.id;
      
      // Add to queue when a cell execution is scheduled
      if (!executingCells.has(notebookPath)) {
        executingCells.set(notebookPath, []);
      }
      executingCells.get(notebookPath)!.push(cellId);
      
      console.log(`Cell ${cellId} queued for execution in ${notebookPath}. Queue:`, executingCells.get(notebookPath));
    
      const onStateChanged = () => {
        if ((cell.model as ICodeCellModel).executionCount !== null) {
          // Remove from front of queue when a cell execution is finished
          const queue = executingCells.get(notebookPath);
          if (queue) {
            const removed = queue.shift();
            console.log(`Cell ${removed} finished in ${notebookPath}. Queue:`, queue);
          }
          cell.model.stateChanged.disconnect(onStateChanged);
        }
      };
      
      cell.model.stateChanged.connect(onStateChanged);
    });

    // ---------
    // Register a comm target for all running kernels
      
    const registeredKernels = new Set<string>();

    const registerCommTarget = (panel: NotebookPanel) => {
      const session = panel.sessionContext;
      if (!session) return;
    
      const setupKernel = () => {
        const kernel = session.session?.kernel;
        if (!kernel || registeredKernels.has(kernel.id)) return;
    
        registeredKernels.add(kernel.id);
    
        kernel.registerCommTarget('wordslab_notebook_comm', (comm, openMsg) => {
          console.log('Comm opened:', {
            commId: comm.commId,
            targetName: openMsg.content.target_name,
            openMsgData: openMsg.content.data,
            notebookPath: session.path
          });
    
          comm.onMsg = (msg) => {
            console.log('Comm message received:', {
              commId: comm.commId,
              msgData: msg.content.data
            });

          const data = msg.content.data as any;
          if (data.request === 'get_notebook_data') {
            const notebookPath = session.path;
            const queue = executingCells.get(notebookPath);
            const cellId = queue && queue.length > 0 ? queue[0] : undefined;
            const notebookJson = panel.model?.toJSON();
            
            comm.send({
              notebook: notebookJson,
              cell_id: cellId
            } as any);
            
            console.log('Sent notebook data:', {
              notebookPath,
              cellId,
              cellCount: (notebookJson as any)?.cells?.length
            });
          }
          };
        });
    
        console.log(`Comm target registered for kernel ${kernel.id} (${session.path})`);
      };
    
      // Handle kernel changes (including restarts and initial connection)
      session.kernelChanged.connect((sender, args) => {
        // Clean up old kernel
        if (args.oldValue) {
          registeredKernels.delete(args.oldValue.id);
          console.log(`Kernel ${args.oldValue.id} removed from registry`);
        }
        // Register new kernel
        if (args.newValue) {
          setupKernel();
        }
      });
    
      // Register if kernel already exists
      session.ready.then(() => setupKernel());
    };
    
    notebookTracker.forEach(panel => registerCommTarget(panel));
    notebookTracker.widgetAdded.connect((sender, panel) => registerCommTarget(panel));
  }
};

export default plugin;
