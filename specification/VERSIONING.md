# AWDF Versioning

AWDF follows Semantic Versioning. Patch releases fix defects without incompatible changes. Minor releases add backwards-compatible optional fields or capabilities. Major releases introduce incompatible changes.

An AWDF 1.x consumer must accept documents with major version 1, ignore unknown optional fields, reject unsupported major versions, and never assume array order is meaningful.
