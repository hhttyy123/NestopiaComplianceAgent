export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const {initializeDb}=await import('./server/db');
  const {recoverInterrupted}=await import('./server/investigation');
  await initializeDb();recoverInterrupted();
 }
}
