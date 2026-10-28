' Opens the UltraChat panel in its own window (starts the server if needed), with no console window.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

nodeExe = "node"
If fso.FileExists(dir & "\node\node.exe") Then nodeExe = """" & dir & "\node\node.exe"""

sh.Run nodeExe & " """ & dir & "\tools\app.mjs""", 0, False
