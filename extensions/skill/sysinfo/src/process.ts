/**
 * 进程信息模块
 */
import { platform } from 'os';
import { execSync } from 'child_process';

export function getProcessInfo(): string {
  const plat = platform();
  
  try {
    let output: string;
    if (plat === 'win32') {
      output = execSync(
        'powershell "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name, Id, @{N=\'CPU\';E={$_.CPU}}, @{N=\'Memory(MB)\';E={[math]::Round($_.WorkingSet/1MB,2)}}"', 
        { encoding: 'utf8' }
      );
    } else {
      output = execSync('ps aux --sort=-%mem | head -11', { encoding: 'utf8' });
    }
    
    return output.trim();
  } catch {
    return '无法获取进程信息';
  }
}

if (require.main === module) {
  console.log(getProcessInfo());
}
