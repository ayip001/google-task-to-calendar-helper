import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true') {
    return NextResponse.json({ error: 'Debug logging disabled' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { level, message, data } = body;

    const timestamp = new Date().toISOString();
    const levelEmoji = level === 'WARN' ? '⚠️' : level === 'ERROR' ? '❌' : 'ℹ️';
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${levelEmoji} [${timestamp}] [${level}] ${message}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (data) {
      if (typeof data === 'object') {
        // Format nested objects nicely
        const formatValue = (val: unknown, indent = 2): string => {
          const spaces = ' '.repeat(indent);
          if (val === null || val === undefined) return 'null';
          if (typeof val === 'string') return `"${val}"`;
          if (typeof val === 'number' || typeof val === 'boolean') return String(val);
          if (Array.isArray(val)) {
            if (val.length === 0) return '[]';
            if (val.length > 5) {
              return `[${val.length} items - showing first 3]\n${spaces}  ${val.slice(0, 3).map(v => formatValue(v, indent + 2)).join(`\n${spaces}  `)}\n${spaces}  ... and ${val.length - 3} more`;
            }
            return `[\n${spaces}  ${val.map(v => formatValue(v, indent + 2)).join(`\n${spaces}  `)}\n${spaces}]`;
          }
          if (typeof val === 'object') {
            const entries = Object.entries(val);
            if (entries.length === 0) return '{}';
            return `{\n${spaces}  ${entries.map(([k, v]) => `${k}: ${formatValue(v, indent + 2)}`).join(`\n${spaces}  `)}\n${spaces}}`;
          }
          return String(val);
        };
        
        console.log(formatValue(data));
      } else {
        console.log(String(data));
      }
    }
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging debug message:', error);
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 });
  }
}
