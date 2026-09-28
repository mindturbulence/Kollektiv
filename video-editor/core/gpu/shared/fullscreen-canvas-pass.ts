// Ported from freecut@4d62e80 src/infrastructure/gpu-shared/fullscreen-canvas-pass.ts — MIT, (c) 2025 FreeCut. Modified for Kollektiv.
/// <reference types="@webgpu/types" />
export function drawFullscreenCanvasPass({
  device,
  context,
  pipeline,
  bindGroup,
  encoder = device.createCommandEncoder(),
  submit = true,
}: {
  device: GPUDevice
  context: GPUCanvasContext
  pipeline: GPURenderPipeline
  bindGroup: GPUBindGroup
  encoder?: GPUCommandEncoder
  submit?: boolean
}): void {
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  })
  renderPass.setPipeline(pipeline)
  renderPass.setBindGroup(0, bindGroup)
  renderPass.draw(6)
  renderPass.end()

  if (submit) {
    device.queue.submit([encoder.finish()])
  }
}
