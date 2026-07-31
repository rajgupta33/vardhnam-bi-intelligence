' Lists every company TallyPrime can see, with its date range and last voucher date.
'
' Read-only: it asks Tally to describe its companies and writes the answer to a
' file beside this script. It creates nothing and alters nothing in Tally.
'
' Run it ON the machine where TallyPrime is running (double-click it there).
' Output: tally_companies.txt  (readable list)  +  tally_companies.xml  (raw)

Option Explicit

Dim endpoint, xml, http, status, responseText
Dim fso, baseDir, txtPath, xmlPath, stream
Dim regex, matches, m, i, summary, count

endpoint = "http://127.0.0.1:9000"

' A Company collection query is the only reliable way to read the exact company
' names — spacing and bracket placement vary between files and must be copied
' verbatim into the dashboard config, never retyped from memory.
xml = "<ENVELOPE>" & _
      "<HEADER>" & _
      "<VERSION>1</VERSION>" & _
      "<TALLYREQUEST>Export</TALLYREQUEST>" & _
      "<TYPE>Collection</TYPE>" & _
      "<ID>CompanyCollection</ID>" & _
      "</HEADER>" & _
      "<BODY>" & _
      "<DESC>" & _
      "<STATICVARIABLES>" & _
      "<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>" & _
      "</STATICVARIABLES>" & _
      "<TDL>" & _
      "<TDLMESSAGE>" & _
      "<COLLECTION NAME=""CompanyCollection"" ISINITIALIZE=""Yes"">" & _
      "<TYPE>Company</TYPE>" & _
      "<FETCH>NAME, STARTINGFROM, ENDINGAT, LASTVOUCHERDATE</FETCH>" & _
      "</COLLECTION>" & _
      "</TDLMESSAGE>" & _
      "</TDL>" & _
      "</DESC>" & _
      "</BODY>" & _
      "</ENVELOPE>"

On Error Resume Next

Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
If Err.Number <> 0 Then
    MsgBox "Could not start the Windows HTTP client." & vbCrLf & _
           "Error: " & Err.Description, vbCritical, "Tally Company List"
    WScript.Quit 1
End If

Err.Clear
http.SetTimeouts 10000, 10000, 30000, 120000
http.Open "POST", endpoint, False
http.SetRequestHeader "Content-Type", "text/xml; charset=utf-8"
http.Send xml

If Err.Number <> 0 Then
    MsgBox "FAILED: Could not connect to Tally at " & endpoint & "." & vbCrLf & vbCrLf & _
           "Run this on the machine where TallyPrime is open." & vbCrLf & _
           "Error: " & Err.Description, vbCritical, "Tally Company List"
    WScript.Quit 2
End If

status = http.Status
responseText = http.ResponseText

Set fso = CreateObject("Scripting.FileSystemObject")
baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
txtPath = fso.BuildPath(baseDir, "tally_companies.txt")
xmlPath = fso.BuildPath(baseDir, "tally_companies.xml")

If status <> 200 Or Len(responseText) = 0 Then
    MsgBox "Tally was reached but did not return a company list." & vbCrLf & _
           "HTTP status: " & status, vbExclamation, "Tally Company List"
    WScript.Quit 3
End If

' Save the raw XML first, so nothing is lost even if the tidy-up below fails.
Err.Clear
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.WriteText responseText
stream.SaveToFile xmlPath, 2
stream.Close

' Pull the readable names out of the XML into a plain list.
Set regex = New RegExp
regex.Pattern = "<NAME>(.*?)</NAME>"
regex.Global = True
regex.IgnoreCase = True
Set matches = regex.Execute(responseText)

count = 0
summary = ""
For i = 0 To matches.Count - 1
    Set m = matches(i)
    If Len(Trim(m.SubMatches(0))) > 0 Then
        count = count + 1
        summary = summary & count & ". " & m.SubMatches(0) & vbCrLf
    End If
Next

Err.Clear
Set stream = CreateObject("ADODB.Stream")
stream.Type = 2
stream.Charset = "utf-8"
stream.Open
stream.WriteText "Companies visible to TallyPrime" & vbCrLf & _
                 "================================" & vbCrLf & vbCrLf & summary
stream.SaveToFile txtPath, 2
stream.Close

MsgBox "Found " & count & " companies:" & vbCrLf & vbCrLf & summary & vbCrLf & _
       "Saved to:" & vbCrLf & txtPath & vbCrLf & xmlPath & vbCrLf & vbCrLf & _
       "Read-only: nothing in Tally was created or changed.", _
       vbInformation, "Tally Company List"
