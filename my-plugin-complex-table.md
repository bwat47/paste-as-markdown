## Cheat Sheet

This is a quick summary of the Markdown syntax.

|     | Markdown | Rendered Output |
| --- | --- | --- |
| **Heading 1** | ```text # Heading 1 ``` | # Heading 1 |
| **Heading 2** | ```text ## Heading 2 ``` | ## Heading 2 |
| **Heading 3** | ```text ### Heading 3 ``` | ### Heading 3 |
| **Bold** | ```block This is some **bold text** ``` | This is some **bold text** |
| **Italic** | ```block This is some *italic text* ``` | This is some *italic text* |
| **Blockquotes** | ```block > Kent. > Where's the king? > Gent. > Contending with the > fretful elements ``` | > Kent.  
Where's the king?  
Gent.  
Contending with  
the fretful elements |
| **List** | ```block - Milk - Eggs - Beers - Desperados - Heineken - Ham ``` | - Milk - Eggs - Beers - Desperados - Heineken - Ham |
| **Ordered list** | ```block 1. Introduction 2. Main topic 1. First sub-topic 2. Second sub-topic 3. Conclusion ``` | 1. Introduction 2. Main topic 1. First sub-topic 2. Second sub-topic 3. Conclusion |
| **Inline code** | ```text This is `someJavaScript()` ``` | This is `someJavaScript()` |
| **Code block** | ````block Here's some JavaScript code: ``` function hello() { alert('hello'); } ``` Language is normally auto-detected, but it can also be specified: ```sql SELECT * FROM users; DELETE FROM sessions; ``` ```` | Here's some JavaScript code:<br><br> ```block function hello() { alert('hello'); } ```   
Language is normally auto-detected, but it can also be specified:  
```block SELECT * FROM users; DELETE FROM sessions; ``` |
| **Unformatted text** | ```block Indent with a tab or 4 spaces for unformatted text. This text will not be formatted: Robert'); DROP TABLE students;-- ``` | Indent with a tab or 4 spaces for unformatted text.  
```block This text will not be formatted: Robert'); DROP TABLE students;-- ``` |
| **Link** | ```block This is detected as a link: https://joplinapp.org And this is a link anchoring text content: [Joplin](https://joplinapp.org) And this is a link, with a title, anchoring text content: [Joplin](https://joplinapp.org "Joplin project page") ``` | This is detected as a link:  
[https://joplinapp.org](https://joplinapp.org/)  
And this is a link anchoring text content:  
[Joplin](https://joplinapp.org/)  
And this is a link, with a title,  
anchoring text content:  
[Joplin](https://joplinapp.org/) (*hint: hover over the link*) |
| **Images** | ```block ![Joplin icon](https://git.io/JenGk) ``` | ![Here's Joplin icon](:/72e1a60a5aba4395a42f694d37781c95) |
| **Horizontal Rule** | ```block One rule: *** Another rule: --- ``` | One rule: * * *   
Another rule:  
* * * |
| **Tables** | [See below](https://joplinapp.org/help/apps/markdown/#tables) |     |