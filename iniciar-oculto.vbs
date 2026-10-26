' Starts the UltraChat server with no visible window (used by the OBS script).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir

' Installed version ships its own node.exe; dev checkout uses the system one.
nodeExe = "node"
If fso.FileExists(dir & "\node\node.exe") Then nodeExe = """" & dir & "\node\node.exe"""

If Not fso.FolderExists(dir & "\node_modules") Then
  ' First run from source: install dependencies (visible so errors can be seen)
  sh.Run "cmd /c npm install --omit=dev", 1, True
End If
sh.Run "cmd /c """ & nodeExe & " --no-warnings src\server.js > ultrachat.log 2>&1""", 0, False
