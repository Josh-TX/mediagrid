A Mobile-First local media player. The /backend folder uses go and sqlite, the /frontend folder use vue with the composition API and `<script setup></script>`

## Glossary

**Gallery**: The home page. An infinite-scroll vertical stack of rows
**Row**: - A full-width container of horiztonal stack of tiles. 
**Tile**: A container for a Preview. May use a hybrid of letterboxing and/or crop-to-fill
**Preview**: Displayable representation of a Media item shown in a Tile; supertype of Thumbnail and Highlight.
**Thumbnail**: downscaled still image from source Media; subtype of Preview.
**Highlight**: short video (3–10s) summarizing a source video; subtype of Preview.
**Media**: original image or video; not a preview/thumbnail/highlight.

**Player**: full-viewport view of a single Media item; Slides in over the gallery; navigates ShuffleList order via swipe up/down.
**Hud**: The Player's controls/info/status-UI overlayed on top of the Media. 
**Swap**: The act of changing the Player's current Media to the next/previous media in the ShuffleList (often via swipe)
**Toolbar**: sticky mostly-transparent strip at top of Gallery for inputs and buttons

**ShuffleList**: A list of Media/previews for the given settings. Often cached on the server
**Shuffle**: The process of generating a shufflelist. 

**Preset**: named collection of settings loaded on startup.
**SelectedPreset**: The preset that's currently selected among the many available presets. a preset named "default" is auto-selected
**Temp Preset**: Temporary changes to the preset stored in session storage, but not saved on the server yet. 
**Filter**: Combined gate (SimpleFilter AND PresetFilter) that determines which Media items are included in the ShuffleList
**SimpleFilter**: Space-delimited text filter; all terms must appear in Media file path (AND logic);
**PresetFilter**: Combined gate of all the presets various filters, such as whitelist, blacklist, aspect ratio, or duration filters. 
