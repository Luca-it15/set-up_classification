param([switch]$ValidateOnly)

$typeName = 'AwdfFolderPicker.NativeFolderPicker'
if (-not ($typeName -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AwdfFolderPicker {
  [ComImport, Guid("dc1c5a9c-e88a-4dde-a5a1-60f82a20aef7")]
  internal class FileOpenDialog { }

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem folder);
    void SetFolder(IShellItem folder);
    void GetFolder(out IShellItem folder);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetResult(out IShellItem item);
    void AddPlace(IShellItem item, int placement);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr filter);
  }

  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface IShellItem {
    void BindToHandler(IntPtr bindContext, ref Guid handlerId, ref Guid interfaceId, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint displayName, out IntPtr name);
    void GetAttributes(uint mask, out uint attributes);
    [PreserveSig] int Compare(IShellItem other, uint hint, out int order);
  }

  public static class NativeFolderPicker {
    private const uint FOS_PICKFOLDERS = 0x00000020;
    private const uint FOS_FORCEFILESYSTEM = 0x00000040;
    private const uint FOS_PATHMUSTEXIST = 0x00000800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;

    public static string SelectFolder(string title) {
      IFileDialog dialog = (IFileDialog)new FileOpenDialog();
      try {
        dialog.SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dialog.SetTitle(title);
        if (dialog.Show(IntPtr.Zero) != 0) return null;

        IShellItem item = null;
        try {
          dialog.GetResult(out item);
          IntPtr value;
          item.GetDisplayName(SIGDN_FILESYSPATH, out value);
          try { return Marshal.PtrToStringUni(value); }
          finally { Marshal.FreeCoTaskMem(value); }
        } finally {
          if (item != null) Marshal.ReleaseComObject(item);
        }
      } finally {
        if (dialog != null) Marshal.ReleaseComObject(dialog);
      }
    }
  }
}
'@
}

if ($ValidateOnly) { return }

$selectedPath = [AwdfFolderPicker.NativeFolderPicker]::SelectFolder('Scegli una cartella del workspace AI')
if ($selectedPath) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $selectedPath
}
