# Desktop runtime

The Desktop runtime context gives the packaged Foleyard application access to native operating-system capabilities.

## Language

**Desktop action**:
A user-requested native operation, such as choosing a folder or revealing a file.

**Desktop bridge**:
The constrained connection through which the Application requests Desktop actions.

**Trusted desktop document**:
The main frame of the Desktop window, loaded from the loopback desktop server. Only this document carries the Desktop bridge and may spend native authority; external links, unexpected navigation, child windows, permission requests and other IPC senders do not.

**Desktop window**:
The window the main process created and tracked as owning the trusted desktop document. IPC is refused unless it comes from that window's main frame.
