import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'wordslab-notebooks-extension:plugin',    
  description: 'JupyterLab extension for wordslab-notebooks',
  autoStart: true,
  requires: [INotebookTracker],
  activate: (app: JupyterFrontEnd, notebookTracker: INotebookTracker) => {
    console.log('Wordslab notebooks extension activated - laps');

    const activeComms = new Map<IKernelConnection, any>();

    notebookTracker.currentChanged.connect(() => {
      const widget = notebookTracker.currentWidget;
      if (!widget) return;

      const kernel = widget.sessionContext.session?.kernel;
      if (!kernel) return;

      if (!activeComms.has(kernel)) {
        setupCommForKernel(kernel);
      }
    });

    function setupCommForKernel(kernel: IKernelConnection) {
      kernel.registerCommTarget('notebook_context_comm', (comm, msg) => {
        console.log('Comm opened from kernel');
        activeComms.set(kernel, comm);

        comm.onMsg = (msg) => {
          if (msg.content.data.action === 'request_cells') {
            const cellsData = gatherNotebookCells();
            comm.send({ cells: cellsData });
          }
        };

        comm.onClose = () => {
          activeComms.delete(kernel);
        };
      });
    }

    function gatherNotebookCells() {
      const widget = notebookTracker.currentWidget;
      if (!widget) return [];

      const notebook = widget.content;
      const cells = [];

      for (let i = 0; i < notebook.model!.cells.length; i++) {
        const cell = notebook.model!.cells.get(i);
        
        const cellData: any = {
          type: cell.type,
          source: cell.sharedModel.source,
          execution_count: null,
          outputs: []
        };

        if (cell.type === 'code') {
          cellData.execution_count = (cell as any).executionCount;
          
          const outputs = (cell as any).outputs;
          for (let j = 0; j < outputs.length; j++) {
            const output = outputs.get(j);
            cellData.outputs.push({
              output_type: output.type,
              data: output.data,
              text: output.text
            });
          }
        }

        cells.push(cellData);
      }

      return cells;
    }

    const currentKernel = notebookTracker.currentWidget?.sessionContext.session?.kernel;
    if (currentKernel) {
      setupCommForKernel(currentKernel);
    }
  }
};

export default plugin;
