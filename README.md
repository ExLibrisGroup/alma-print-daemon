# alma-print-daemon
The Alma Print Daemon is an Alma extension that helps you to automatically print letters and slips from the Alma Printout Queues.  With this print daemon extension there is no need to use email based printing.  It will also automatically update itself when new versions are available for easy management and upkeep.

The application may be installed as a service on a Windows workstation using nssm (https://nssm.cc/).  

The extension's configuration settings include:

- region (Asia Pacific, Canada, China, Europe, North America)
- API key (read permission for Configuration, read/write permissions for Task-lists
- Alma Printer Profiles, associating Alma Printer Queues to be serviced by local and/or network printers
- Automatic interval printing (in minutes, decimals allowed) or manual on-demand printing

Requires at least Alma March 2020 release.

Microsoft Windows and macOS versions available.

https://github.com/ExLibrisGroup/alma-print-daemon/releases/
