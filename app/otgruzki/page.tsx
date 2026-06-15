import System from '@/app/system/page'
import ProductMovementForm from '@/app/components/ProductMovementForm'

export default function Page() {
    return (
        <System>
            <section className="relative z-0 w-full min-h-screen bg-gray-50 p-4">
                <div className="mx-auto max-w-[1600px]">
                    <ProductMovementForm mode="shipment" />
                </div>
            </section>
        </System>
    )
}