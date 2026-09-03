# Yard Tools

Yard Tools defines optional workflows that extend Foleyard without becoming required Library behavior.

## Language

**Extension**:
An optional workflow package that declares its identity, Commands, Permissions, settings, and behavior.
_Avoid_: Plugin

**Command**:
A named action declared by an Extension and made available through the Extension host.

**Permission**:
A declared capability that an Extension must hold before it can access a protected operation.

**Extension context**:
The constrained set of selection data, Permissions, and Yard Core operations available to an Extension.
_Avoid_: App internals
