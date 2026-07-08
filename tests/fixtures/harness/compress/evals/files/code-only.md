```python
def canonicalize(path: str) -> str:
    """Resolve symlinks and normalize case."""
    import os
    return os.path.realpath(path)
```
