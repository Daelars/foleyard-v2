# Yard Core

Yard Core defines the stable language and behavior shared by the Foleyard Application and Yard Tools.

## Language

**Library**:
The user's indexed set of local audio files and their organization data.

**Library root**:
A local directory selected as a source for the Library.
_Avoid_: Library folder

**Audio file**:
An indexed sound recording that can be browsed, searched, previewed, and organized.
_Avoid_: Track, sound item

**Scan**:
The process that reconciles Audio files under the Library roots with the Library index.

**Tag**:
A named label attached to an Audio file for organization and search.

**Collection**:
A named organization of Audio files. A regular Collection has explicit membership, while a Smart Collection derives membership from saved criteria.
_Avoid_: Playlist
