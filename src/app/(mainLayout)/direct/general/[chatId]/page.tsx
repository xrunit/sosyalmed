import DirectChat from '@/src/pageComponents/DirectMessages/components/DirectChat';

interface DirectGeneralChatPageProps {
   params: Promise<{ chatId: string }>;
}

export default async function DirectGeneralChatPage({ params }: DirectGeneralChatPageProps) {
   const { chatId } = await params;
   return (
      <DirectChat
         chatId={chatId}
         folder="general"
         currentFolderHref="/direct/general"
         emptyVariant="messages"
      />
   );
}
