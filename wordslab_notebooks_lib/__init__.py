from .core import Wordslab
from .notebook import WordslabNotebook

__version__ = "0.0.13"
__all__ = ["Wordslab", "WordslabNotebook"]

def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "wordslab-notebooks-lib"
    }]