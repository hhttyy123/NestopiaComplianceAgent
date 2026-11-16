import {NextRequest,NextResponse} from 'next/server';
import {accessPolicy} from './server/access';
export function proxy(req:NextRequest){
 const denied=accessPolicy(req);if(denied){const options={status:denied.status,headers:{'Cache-Control':'no-store',...(denied.authenticate?{'WWW-Authenticate':'Basic realm="Nestopia", charset="UTF-8"'}:{})}};return req.nextUrl.pathname.startsWith('/api/')?NextResponse.json({message:denied.message},options):new NextResponse(denied.message,options);}
 if(req.nextUrl.searchParams.get('view')==='developer'||req.nextUrl.pathname==='/api/developer')return new NextResponse('Not found',{status:404});
 return NextResponse.next();
}
export const config={matcher:['/','/api/:path*','/developer/:path*']};
