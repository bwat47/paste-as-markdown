## Cheat Sheet

This is a quick summary of the Markdown syntax.

||Markdown|Rendered Output|
|---|---|---|
|**Heading 1**|```<br># Heading 1<br>```|# Heading 1|
|**Heading 2**|```<br>## Heading 2<br>```|## Heading 2|
|**Heading 3**|```<br>### Heading 3<br>```|### Heading 3|
|**Bold**|```<br>This is some **bold text**<br>```|This is some **bold text**|
|**Italic**|```<br>This is some *italic text*<br>```|This is some _italic text_|
|**Blockquotes**|```<br>> Kent.> Where's the king?> Gent.> Contending with the> fretful elements<br>```|> Kent.  <br>> Where's the king?  <br>>   <br>> Gent.  <br>> Contending with  <br>> the fretful elements|
|**List**|```<br>- Milk- Eggs- Beers    - Desperados    - Heineken- Ham<br>```|- Milk<br>- Eggs<br>- Beers<br>    - Desperados<br>    - Heineken<br>- Ham|
|**Ordered list**|```<br>1. Introduction2. Main topic    1. First sub-topic    2. Second sub-topic3. Conclusion<br>```|1. Introduction<br>2. Main topic<br>    1. First sub-topic<br>    2. Second sub-topic<br>3. Conclusion|
|**Inline code**|```<br>This is `someJavaScript()`<br>```|This is `someJavaScript()`|
|**Code block**|```<br>Here's some JavaScript code:```function hello() {    alert('hello');}```Language is normally auto-detected,but it can also be specified:```sqlSELECT * FROM users;DELETE FROM sessions;```<br>```|Here's some JavaScript code:  <br>  <br><br>```<br>function hello() {    alert('hello');}<br>```<br><br>  <br>Language is normally auto-detected, but it can also be specified:  <br>  <br><br>```<br>SELECT * FROM users;DELETE FROM sessions;<br>```|
|**Unformatted text**|```<br>Indent with a tab or 4 spacesfor unformatted text.    This text will not be formatted:    Robert'); DROP TABLE students;--<br>```|Indent with a tab or 4 spaces for unformatted text.  <br>  <br><br>```<br>This text will not be formatted:Robert'); DROP TABLE students;--<br>```|
|**Link**|```<br>This is detected as a link:https://joplinapp.orgAnd this is a link anchoring text content:[Joplin](https://joplinapp.org)And this is a link, with a title,anchoring text content:[Joplin](https://joplinapp.org "Joplin project page")<br>```|This is detected as a link:  <br>  <br>[https://joplinapp.org](https://joplinapp.org/)  <br>  <br>And this is a link anchoring text content:  <br>  <br>[Joplin](https://joplinapp.org/)  <br>  <br>And this is a link, with a title,  <br>anchoring text content:  <br>  <br>[Joplin](https://joplinapp.org/) (_hint: hover over the link_)|
|**Images**|```<br>![Joplin icon](https://git.io/JenGk)<br>```|![Here's Joplin icon](https://git.io/JenGk)|
|**Horizontal Rule**|```<br>One rule:***Another rule:---<br>```|One rule:<br><br>---<br><br>  <br>Another rule:  <br><br>---|
|**Tables**|[See below](https://joplinapp.org/help/apps/markdown/#tables)||