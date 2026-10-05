const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Windows stat.mode cannot describe access control. Check the actual DACL
// inherited from a private directory instead of accepting synthetic 0666.
function assertPrivateFile(file) {
    if (process.platform !== 'win32') {
        assert.equal(fs.statSync(file).mode & 0o777, 0o600);
        return;
    }
    const script = `
$ErrorActionPreference = 'Stop'
$acl = Get-Acl -LiteralPath $env:NODIE_TEST_PRIVATE_FILE
$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) | ForEach-Object {
    @{ sid = $_.IdentityReference.Value; allow = ($_.AccessControlType -eq 'Allow'); rights = [int]$_.FileSystemRights }
})
@{ user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; rules = $rules } | ConvertTo-Json -Depth 4 -Compress
`;
    const acl = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        encoding: 'utf8', timeout: 20000, windowsHide: true,
        env: { ...process.env, NODIE_TEST_PRIVATE_FILE: file }
    }));
    // SYSTEM and local administrators, like root on POSIX, can access user data.
    const allowed = new Set([acl.user, 'S-1-5-18', 'S-1-5-32-544']);
    assert.ok(acl.rules.some(rule => rule.allow && rule.sid === acl.user && (rule.rights & 1)), 'Current user must have file read access');
    for (const rule of acl.rules) {
        if (rule.allow && rule.rights) assert.ok(allowed.has(rule.sid), `Private file grants access to unexpected SID ${rule.sid}`);
    }
}
// Shared Windows temp directories may grant sandbox/service accounts access.
// Match the private-profile precondition before writing any fixture data.
function privateTempDir(prefix) {
    const dir = fs.mkdtempSync(prefix);
    if (process.platform !== 'win32') return dir;
    const script = `
$ErrorActionPreference = 'Stop'
$acl = New-Object System.Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($user)
foreach ($sid in @($user.Value, 'S-1-5-18', 'S-1-5-32-544')) {
    $identity = New-Object System.Security.Principal.SecurityIdentifier($sid)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $env:NODIE_TEST_PRIVATE_DIR -AclObject $acl
`;
    try {
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
            timeout: 20000, windowsHide: true,
            env: { ...process.env, NODIE_TEST_PRIVATE_DIR: dir }
        });
        return dir;
    } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
    }
}
module.exports = { assertPrivateFile, privateTempDir };
